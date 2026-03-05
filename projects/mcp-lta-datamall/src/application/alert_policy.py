from __future__ import annotations

from datetime import datetime, time


def in_quiet_hours(now: datetime, start_hhmm: str, end_hhmm: str) -> bool:
    sh, sm = [int(x) for x in start_hhmm.split(":")]
    eh, em = [int(x) for x in end_hhmm.split(":")]
    start = time(sh, sm)
    end = time(eh, em)
    t = now.time()
    if start <= end:
        return start <= t < end
    # overnight window
    return t >= start or t < end


def threshold_crossed(mins_to_leave: int, thresholds: list[int]) -> int | None:
    for th in sorted(thresholds, reverse=True):
        if mins_to_leave <= th:
            return th
    return None
