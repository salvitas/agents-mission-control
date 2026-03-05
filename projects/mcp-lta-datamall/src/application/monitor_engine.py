from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Iterable

from src.application.alert_policy import in_quiet_hours, threshold_crossed
from src.interfaces import tools
from src.domain.monitor import MonitorConfig, MonitorState
from src.infrastructure.state_store import StateStore
from src.infrastructure.notifier import Notifier
from src.infrastructure.logging import log_event


@dataclass
class AlertTarget:
    channel: str
    target: str


class MonitorEngine:
    def __init__(self, store: StateStore, notifier: Notifier, targets: dict[str, list[AlertTarget]]):
        self.store = store
        self.notifier = notifier
        self.targets = targets

    def tick_all(self) -> None:
        for cfg in self.store.list_monitors():
            if not cfg.enabled:
                continue
            self.tick(cfg)

    def tick(self, cfg: MonitorConfig) -> None:
        now = datetime.now().astimezone()
        log_event("monitor.tick.start", monitor_id=cfg.id, origin=cfg.origin, destination=cfg.destination, service_no=cfg.service_no)

        res = tools.leave_time(origin=cfg.origin, destination=cfg.destination, service_no=cfg.service_no)
        if not res.ok:
            log_event("monitor.tick.leave_time_error", monitor_id=cfg.id, error=res.data)
            return

        plan = (res.data or {}).get("plan", {})
        mins = int(plan.get("mins_to_leave", 9999)) if plan.get("status") == "ok" else 9999
        crossed = threshold_crossed(mins, cfg.thresholds_min)
        rec = plan.get("recommendation")

        state = self.store.get_state(cfg.id)

        if in_quiet_hours(now, cfg.quiet_hours_start, cfg.quiet_hours_end):
            # still update state, suppress alert
            log_event("monitor.tick.quiet_hours_suppressed", monitor_id=cfg.id, recommendation=rec)
            state.last_recommendation = rec
            state.updated_at = now.isoformat()
            self.store.set_state(cfg.id, state)
            return

        if crossed is not None:
            alert_key = f"th:{crossed}|rec:{rec}"
            if state.last_alert_key != alert_key:
                msg = self._format_alert(cfg, mins, crossed, res.data)
                for ch in cfg.channels:
                    for t in self.targets.get(ch, []):
                        try:
                            self.notifier.send(ch, t.target, msg)
                            log_event("monitor.alert.sent", monitor_id=cfg.id, channel=ch, target=t.target, threshold=crossed)
                        except Exception as e:
                            log_event("monitor.alert.send_error", monitor_id=cfg.id, channel=ch, target=t.target, error=str(e))
                state.last_alert_key = alert_key

        state.last_recommendation = rec
        state.updated_at = now.isoformat()
        self.store.set_state(cfg.id, state)

    @staticmethod
    def _format_alert(cfg: MonitorConfig, mins: int, crossed: int, data: dict) -> str:
        stop = (data.get("resolved_stop") or {}).get("description", "unknown stop")
        svc = cfg.service_no or "next available"
        if mins <= 0:
            action = "Leave now"
        else:
            action = f"Leave in {mins} min"
        return (
            f"🚌 singapore-transport alert\n"
            f"Route: {cfg.origin} -> {cfg.destination}\n"
            f"Service: {svc}\n"
            f"Stop: {stop}\n"
            f"Threshold: {crossed}m\n"
            f"Action: {action}"
        )
