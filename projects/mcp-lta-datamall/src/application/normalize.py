"""Normalization helpers for MCP tool outputs."""
from __future__ import annotations

from datetime import datetime
from typing import Any


def _mins_to_eta(iso_ts: str | None) -> int | None:
    if not iso_ts:
        return None
    try:
        dt = datetime.fromisoformat(iso_ts.replace('Z', '+00:00'))
        now = datetime.now(dt.tzinfo)
        return max(0, int((dt - now).total_seconds() // 60))
    except Exception:
        return None


def normalize_bus_arrival(payload: dict[str, Any]) -> dict[str, Any]:
    services = payload.get("Services", []) or []
    out = []
    for s in services:
        out.append({
            "service_no": s.get("ServiceNo"),
            "operator": s.get("Operator"),
            "next": {
                "eta": s.get("NextBus", {}).get("EstimatedArrival"),
                "eta_min": _mins_to_eta(s.get("NextBus", {}).get("EstimatedArrival")),
                "load": s.get("NextBus", {}).get("Load"),
                "type": s.get("NextBus", {}).get("Type"),
            },
            "next2": {
                "eta": s.get("NextBus2", {}).get("EstimatedArrival"),
                "eta_min": _mins_to_eta(s.get("NextBus2", {}).get("EstimatedArrival")),
            },
            "next3": {
                "eta": s.get("NextBus3", {}).get("EstimatedArrival"),
                "eta_min": _mins_to_eta(s.get("NextBus3", {}).get("EstimatedArrival")),
            },
        })
    return {"services": out, "count": len(out)}


def normalize_bus_route(payload: dict[str, Any]) -> dict[str, Any]:
    rows = payload.get("value", []) or []
    return {
        "count": len(rows),
        "routes": [
            {
                "service_no": r.get("ServiceNo"),
                "direction": r.get("Direction"),
                "stop_sequence": r.get("StopSequence"),
                "bus_stop_code": r.get("BusStopCode"),
                "distance_km": r.get("Distance"),
                "wd_first_bus": r.get("WD_FirstBus"),
                "wd_last_bus": r.get("WD_LastBus"),
            }
            for r in rows
        ],
    }
