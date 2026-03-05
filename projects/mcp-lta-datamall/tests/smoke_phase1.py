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
    print("services:", len(eta.data.get("Services", [])))

    route = tools.bus_route("15")
    print("bus_route ok:", route.ok)
    print("rows:", len(route.data.get("value", [])))

    print("sample:")
    print(json.dumps({
        "arrival_first": eta.data.get("Services", [])[:1],
        "route_first": route.data.get("value", [])[:1],
    }, indent=2)[:1200])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
