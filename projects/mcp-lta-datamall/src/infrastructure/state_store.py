from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path
from typing import Any

from src.domain.monitor import MonitorConfig, MonitorState


class StateStore:
    def __init__(self, path: str):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.path.exists():
            self.path.write_text(json.dumps({"monitors": {}, "state": {}}, indent=2))

    def _read(self) -> dict[str, Any]:
        return json.loads(self.path.read_text())

    def _write(self, data: dict[str, Any]) -> None:
        self.path.write_text(json.dumps(data, indent=2))

    def upsert_monitor(self, cfg: MonitorConfig) -> None:
        d = self._read()
        d["monitors"][cfg.id] = asdict(cfg)
        d["state"].setdefault(cfg.id, asdict(MonitorState()))
        self._write(d)

    def list_monitors(self) -> list[MonitorConfig]:
        d = self._read()
        return [MonitorConfig(**m) for m in d.get("monitors", {}).values()]

    def get_state(self, monitor_id: str) -> MonitorState:
        d = self._read()
        s = d.get("state", {}).get(monitor_id, {})
        return MonitorState(**s)

    def set_state(self, monitor_id: str, state: MonitorState) -> None:
        d = self._read()
        d.setdefault("state", {})[monitor_id] = asdict(state)
        self._write(d)

    def set_enabled(self, monitor_id: str, enabled: bool) -> None:
        d = self._read()
        if monitor_id in d.get("monitors", {}):
            d["monitors"][monitor_id]["enabled"] = enabled
            self._write(d)

    def delete_monitor(self, monitor_id: str) -> None:
        d = self._read()
        d.get("monitors", {}).pop(monitor_id, None)
        d.get("state", {}).pop(monitor_id, None)
        self._write(d)
