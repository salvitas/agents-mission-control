from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

Channel = Literal["telegram", "whatsapp"]


@dataclass
class MonitorConfig:
    id: str
    origin: str
    destination: str
    service_no: str | None = None
    channels: list[Channel] = field(default_factory=lambda: ["telegram"])
    thresholds_min: list[int] = field(default_factory=lambda: [15, 10, 5])
    quiet_hours_start: str = "23:00"
    quiet_hours_end: str = "07:00"
    enabled: bool = True


@dataclass
class MonitorState:
    last_recommendation: str | None = None
    last_alert_key: str | None = None
    updated_at: str | None = None
