from dataclasses import dataclass
import os

@dataclass
class Settings:
    lta_api_key: str = os.getenv("LTA_DATAMALL_API_KEY", "")
    poll_interval_sec: int = int(os.getenv("TRANSIT_POLL_INTERVAL_SEC", "30"))
    forecast_min: int = int(os.getenv("TRANSIT_FORECAST_MIN", "60"))
