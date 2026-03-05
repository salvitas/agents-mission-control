"""Phase 1 tool façade (to be exposed via MCP runtime in next step)."""
from __future__ import annotations

from dataclasses import asdict, dataclass
import os
from typing import Any

from datetime import datetime

from src.infrastructure.datamall_client import DataMallClient
from src.application.normalize import normalize_bus_arrival, normalize_bus_route
from src.application.geo import parse_latlon, nearest_stop_by_coords, nearest_stop_by_text
from src.application.leave_time import compute_leave_plan


@dataclass
class ToolResult:
    ok: bool
    data: Any


def _client() -> DataMallClient:
    return DataMallClient(api_key=os.getenv("LTA_DATAMALL_API_KEY", ""))


def bus_arrival(stop_code: str, service_no: str | None = None) -> ToolResult:
    raw = _client().bus_arrival(stop_code=stop_code, service_no=service_no)
    data = normalize_bus_arrival(raw)
    return ToolResult(ok=True, data=data)


def bus_route(service_no: str, direction: int | None = None) -> ToolResult:
    raw = _client().bus_route(service_no=service_no, direction=direction)
    data = normalize_bus_route(raw)
    return ToolResult(ok=True, data=data)


def nearest_stop(destination: str) -> ToolResult:
    stops = _client().bus_stops().get("value", [])
    latlon = parse_latlon(destination)
    if latlon:
        found = nearest_stop_by_coords(stops, latlon[0], latlon[1])
        return ToolResult(ok=bool(found), data=found or {})
    found = nearest_stop_by_text(stops, destination)
    return ToolResult(ok=bool(found), data=found or {})


def leave_time(origin: str, destination: str, service_no: str | None = None) -> ToolResult:
    # v1: resolve destination nearest stop, then ETA from that stop (or service filter),
    # then compute leave recommendation with default walk+buffer.
    dest = nearest_stop(destination)
    if not dest.ok:
        return ToolResult(ok=False, data={"error": "destination_not_found"})

    stop_code = dest.data["bus_stop_code"]
    eta_raw = _client().bus_arrival(stop_code=stop_code, service_no=service_no)
    eta = normalize_bus_arrival(eta_raw)
    first = (eta.get("services") or [{}])[0]
    next_eta = ((first.get("next") or {}).get("eta"))

    plan = compute_leave_plan(
        now=datetime.now().astimezone(),
        next_bus_eta=next_eta,
        walk_minutes=8,
        buffer_minutes=3,
    )

    return ToolResult(
        ok=True,
        data={
            "origin": origin,
            "destination": destination,
            "resolved_stop": dest.data,
            "service_no": service_no,
            "plan": plan,
            "eta_snapshot": first,
        },
    )


def to_dict(result: ToolResult) -> dict[str, Any]:
    return asdict(result)
