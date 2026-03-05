from __future__ import annotations

import math
from typing import Any


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def parse_latlon(text: str) -> tuple[float, float] | None:
    try:
        s = text.strip().replace(" ", "")
        if "," not in s:
            return None
        a, b = s.split(",", 1)
        return float(a), float(b)
    except Exception:
        return None


def nearest_stop_by_coords(stops: list[dict[str, Any]], lat: float, lon: float) -> dict[str, Any] | None:
    best = None
    best_d = float("inf")
    for s in stops:
        try:
            slat = float(s.get("Latitude"))
            slon = float(s.get("Longitude"))
        except Exception:
            continue
        d = haversine_m(lat, lon, slat, slon)
        if d < best_d:
            best_d = d
            best = s
    if not best:
        return None
    return {
        "bus_stop_code": best.get("BusStopCode"),
        "road_name": best.get("RoadName"),
        "description": best.get("Description"),
        "latitude": best.get("Latitude"),
        "longitude": best.get("Longitude"),
        "distance_m": round(best_d, 1),
    }


def nearest_stop_by_text(stops: list[dict[str, Any]], text: str) -> dict[str, Any] | None:
    q = text.strip().lower()
    if not q:
        return None

    # normalize common singapore transit phrasing
    qn = q.replace("mrt", "stn").replace("station", "stn")
    tokens = [t for t in qn.replace("/", " ").split() if t]

    ranked: list[tuple[int, dict[str, Any]]] = []
    for s in stops:
        desc = str(s.get("Description", "")).lower()
        road = str(s.get("RoadName", "")).lower()
        hay = f"{desc} {road}"

        score = 0
        if desc == q or desc == qn:
            score = max(score, 100)
        if desc.startswith(q) or desc.startswith(qn):
            score = max(score, 90)
        if q in desc or qn in desc:
            score = max(score, 85)
        if q in road or qn in road:
            score = max(score, 75)

        # token overlap fallback
        if tokens:
            overlap = sum(1 for t in tokens if t in hay)
            if overlap:
                score = max(score, 50 + overlap * 10)

        if score > 0:
            ranked.append((score, s))

    if not ranked:
        return None
    ranked.sort(key=lambda x: x[0], reverse=True)
    best = ranked[0][1]
    return {
        "bus_stop_code": best.get("BusStopCode"),
        "road_name": best.get("RoadName"),
        "description": best.get("Description"),
        "latitude": best.get("Latitude"),
        "longitude": best.get("Longitude"),
        "match_mode": "text",
    }
