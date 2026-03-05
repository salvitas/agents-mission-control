"""Phase 1 tool façade (to be exposed via MCP runtime in next step)."""
from __future__ import annotations

from dataclasses import asdict, dataclass
import os
from typing import Any

from src.infrastructure.datamall_client import DataMallClient


@dataclass
class ToolResult:
    ok: bool
    data: Any


def _client() -> DataMallClient:
    return DataMallClient(api_key=os.getenv("LTA_DATAMALL_API_KEY", ""))


def bus_arrival(stop_code: str, service_no: str | None = None) -> ToolResult:
    data = _client().bus_arrival(stop_code=stop_code, service_no=service_no)
    return ToolResult(ok=True, data=data)


def bus_route(service_no: str, direction: int | None = None) -> ToolResult:
    data = _client().bus_route(service_no=service_no, direction=direction)
    return ToolResult(ok=True, data=data)


def to_dict(result: ToolResult) -> dict[str, Any]:
    return asdict(result)
