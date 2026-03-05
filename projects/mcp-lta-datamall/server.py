#!/usr/bin/env python3
from __future__ import annotations

import os
import sys
from pathlib import Path

# Ensure local src imports work
ROOT = Path(__file__).resolve().parent
sys.path.append(str(ROOT))

from mcp.server.fastmcp import FastMCP
from src.interfaces import tools

mcp = FastMCP("singapore-transport")


@mcp.tool()
def bus_arrival(stop_code: str, service_no: str | None = None):
    return tools.to_dict(tools.bus_arrival(stop_code=stop_code, service_no=service_no))


@mcp.tool()
def bus_route(service_no: str, direction: int | None = None):
    return tools.to_dict(tools.bus_route(service_no=service_no, direction=direction))


@mcp.tool()
def nearest_stop(destination: str):
    return tools.to_dict(tools.nearest_stop(destination=destination))


@mcp.tool()
def leave_time(origin: str, destination: str, service_no: str | None = None):
    return tools.to_dict(tools.leave_time(origin=origin, destination=destination, service_no=service_no))


@mcp.tool()
def monitor_create(origin: str, destination: str, service_no: str | None = None, channels: list[str] | None = None):
    return tools.to_dict(tools.monitor_create(origin=origin, destination=destination, service_no=service_no, channels=channels))


@mcp.tool()
def monitor_list():
    return tools.to_dict(tools.monitor_list())


@mcp.tool()
def monitor_pause(monitor_id: str):
    return tools.to_dict(tools.monitor_pause(monitor_id=monitor_id))


@mcp.tool()
def monitor_resume(monitor_id: str):
    return tools.to_dict(tools.monitor_resume(monitor_id=monitor_id))


@mcp.tool()
def monitor_delete(monitor_id: str):
    return tools.to_dict(tools.monitor_delete(monitor_id=monitor_id))


if __name__ == "__main__":
    # stdio transport for mcporter/openclaw MCP runtime
    mcp.run("stdio")
