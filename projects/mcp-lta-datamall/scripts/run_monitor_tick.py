#!/usr/bin/env python3
from __future__ import annotations

import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from src.application.monitor_engine import MonitorEngine, AlertTarget
from src.infrastructure.state_store import StateStore
from src.infrastructure.notifier import ConsoleNotifier


def main() -> int:
    store_path = os.getenv("TRANSIT_STATE_PATH", os.path.expanduser("~/.openclaw/workspace/tmp/singapore-transport/monitors.json"))
    store = StateStore(store_path)

    # TODO: bind these from config per monitor/user
    targets = {
        "telegram": [AlertTarget(channel="telegram", target=os.getenv("TRANSIT_TELEGRAM_TARGET", "526217739"))],
        "whatsapp": [AlertTarget(channel="whatsapp", target=os.getenv("TRANSIT_WHATSAPP_TARGET", "6589490107@s.whatsapp.net"))],
    }

    eng = MonitorEngine(store=store, notifier=ConsoleNotifier(), targets=targets)
    eng.tick_all()
    print("tick_done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
