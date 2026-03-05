#!/usr/bin/env python3
from datetime import datetime
import os, sys
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))
from src.application.alert_policy import in_quiet_hours, threshold_crossed

# quick assertions
assert threshold_crossed(14, [15,10,5]) == 15
assert threshold_crossed(9, [15,10,5]) == 15
assert threshold_crossed(4, [15,10,5]) == 15
assert threshold_crossed(30, [15,10,5]) is None

# overnight quiet window
n1 = datetime.fromisoformat('2026-03-05T23:30:00+08:00')
n2 = datetime.fromisoformat('2026-03-06T06:30:00+08:00')
n3 = datetime.fromisoformat('2026-03-06T12:00:00+08:00')
assert in_quiet_hours(n1, '23:00', '07:00') is True
assert in_quiet_hours(n2, '23:00', '07:00') is True
assert in_quiet_hours(n3, '23:00', '07:00') is False

print('alert_policy_tests_ok')
