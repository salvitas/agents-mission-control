from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any


def parse_eta(iso_ts: str | None) -> datetime | None:
    if not iso_ts:
        return None
    try:
        return datetime.fromisoformat(iso_ts.replace('Z', '+00:00'))
    except Exception:
        return None


def compute_leave_plan(
    now: datetime,
    next_bus_eta: str | None,
    walk_minutes: int = 8,
    buffer_minutes: int = 3,
) -> dict[str, Any]:
    bus_dt = parse_eta(next_bus_eta)
    if not bus_dt:
        return {
            "status": "no_eta",
            "recommendation": "No ETA available now. Retry shortly.",
        }

    leave_at = bus_dt - timedelta(minutes=(walk_minutes + buffer_minutes))
    mins_to_leave = int((leave_at - now).total_seconds() // 60)
    if mins_to_leave <= 0:
        rec = "leave_now"
    else:
        rec = f"leave_in_{mins_to_leave}m"

    return {
        "status": "ok",
        "next_bus_eta": next_bus_eta,
        "walk_minutes": walk_minutes,
        "buffer_minutes": buffer_minutes,
        "leave_at": leave_at.isoformat(),
        "mins_to_leave": max(mins_to_leave, 0),
        "recommendation": rec,
    }
