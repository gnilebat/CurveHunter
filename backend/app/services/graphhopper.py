import httpx
import os
from typing import Any

GH_URL = os.environ["GRAPHHOPPER_URL"]  # e.g. http://graphhopper:8989

async def route(
    start_lat: float, start_lng: float,
    end_lat: float, end_lng: float,
    prefer_curvy: bool
) -> dict[str, Any]:
    payload = {
        "points": [[start_lng, start_lat], [end_lng, end_lat]],
        "profile": "motorcycle_curvy" if prefer_curvy else "motorcycle",
        "points_encoded": False,
        "instructions": False,
        "elevation": True,
        "locale": "en"
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(f"{GH_URL}/route", json=payload)
        resp.raise_for_status()
        return resp.json()
