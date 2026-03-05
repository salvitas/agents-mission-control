#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from src.interfaces import tools  # noqa: E402


def main() -> int:
    if not os.getenv("LTA_DATAMALL_API_KEY"):
        print("Missing LTA_DATAMALL_API_KEY")
        return 2

    # Example stop code in SG (adjustable)
    eta = tools.bus_arrival("83139")
    print("bus_arrival ok:", eta.ok)
    print("services:", eta.data.get("count"))

    route = tools.bus_route("15")
    print("bus_route ok:", route.ok)
    print("rows:", route.data.get("count"))

    near = tools.nearest_stop("Tampines MRT")
    print("nearest_stop ok:", near.ok, near.data.get("bus_stop_code"))

    leave = tools.leave_time(origin="home", destination="Tampines MRT", service_no="15")
    print("leave_time ok:", leave.ok)

    print("sample:")
    print(json.dumps({
        "arrival_first": eta.data.get("services", [])[:1],
        "route_first": route.data.get("routes", [])[:1],
        "nearest": near.data,
        "leave": leave.data.get("plan", {}),
    }, indent=2)[:1800])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
