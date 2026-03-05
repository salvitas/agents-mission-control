from __future__ import annotations

import json
from datetime import datetime, UTC


def log_event(event: str, **fields):
    payload = {
        "ts": datetime.now(UTC).isoformat(),
        "event": event,
        **fields,
    }
    print(json.dumps(payload, ensure_ascii=False))
