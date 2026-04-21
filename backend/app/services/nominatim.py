import httpx
import os
from typing import Any

NOMINATIM_URL = os.environ["NOMINATIM_URL"]  # e.g. http://nominatim:8080

async def search(query: str, limit: int = 6) -> list[dict[str, Any]]:
    params = {
        "q": query,
        "format": "json",
        "limit": limit,
        "addressdetails": 0
    }
    headers = {"Accept-Language": "en"}
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(f"{NOMINATIM_URL}/search", params=params, headers=headers)
        resp.raise_for_status()
        return resp.json()
