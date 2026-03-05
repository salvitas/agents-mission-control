"""LTA DataMall API client (phase 1)."""
from __future__ import annotations

import json
import random
import time
from typing import Any
from urllib import parse, request, error


class DataMallError(RuntimeError):
    pass


class DataMallClient:
    BASE_URL = "https://datamall2.mytransport.sg/ltaodataservice"

    def __init__(self, api_key: str, timeout_sec: int = 15, max_retries: int = 3):
        if not api_key:
            raise DataMallError("Missing LTA_DATAMALL_API_KEY")
        self.api_key = api_key
        self.timeout_sec = timeout_sec
        self.max_retries = max_retries

    def _get(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        q = f"?{parse.urlencode(params)}" if params else ""
        url = f"{self.BASE_URL}/{path}{q}"
        headers = {
            "AccountKey": self.api_key,
            "accept": "application/json",
        }

        attempt = 0
        while True:
            attempt += 1
            req = request.Request(url, headers=headers, method="GET")
            try:
                with request.urlopen(req, timeout=self.timeout_sec) as resp:
                    raw = resp.read().decode("utf-8")
                    return json.loads(raw)
            except error.HTTPError as e:
                # retry transient and rate-limit
                if e.code in (429, 500, 502, 503, 504) and attempt < self.max_retries:
                    self._sleep_backoff(attempt)
                    continue
                raise DataMallError(f"HTTP {e.code} for {path}") from e
            except error.URLError as e:
                if attempt < self.max_retries:
                    self._sleep_backoff(attempt)
                    continue
                raise DataMallError(f"Network error for {path}: {e}") from e

    @staticmethod
    def _sleep_backoff(attempt: int) -> None:
        base = min(2 ** attempt, 10)
        time.sleep(base + random.uniform(0, 0.4))

    def bus_arrival(self, stop_code: str, service_no: str | None = None) -> dict[str, Any]:
        params: dict[str, Any] = {"BusStopCode": stop_code}
        if service_no:
            params["ServiceNo"] = service_no
        # DataMall v6.7 docs use v3 endpoint for Bus Arrival
        return self._get("v3/BusArrival", params)

    def bus_route(self, service_no: str, direction: int | None = None) -> dict[str, Any]:
        # BusRoutes supports $filter on ServiceNo (+ optional Direction)
        filt = f"ServiceNo eq '{service_no}'"
        if direction is not None:
            filt += f" and Direction eq {direction}"
        params = {"$filter": filt}
        return self._get("BusRoutes", params)
