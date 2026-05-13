"""Place-name autocomplete via Photon (komoot/photon) — a Java/Elasticsearch
geocoder built on OSM data, designed for fast autocomplete. Drop-in for the
previous Nominatim adapter from the search router's perspective: same return
shape `[{ lat, lon, display_name }]`.
"""
import httpx
import os
from typing import Any

GEOCODER_URL = os.environ.get("GEOCODER_URL", "http://photon:2322")
GEOCODER_LANG = os.environ.get("GEOCODER_LANG", "de")  # de | en | fr | it

# Germany bounding box (minLon, minLat, maxLon, maxLat). Photon hard-filters
# results to this bbox, so we never surface foreign hits in autocomplete.
# Override via env if the app's coverage area ever changes.
GEOCODER_BBOX = os.environ.get("GEOCODER_BBOX", "5.87,47.27,15.04,55.10")


def _display_name_from_props(props: dict[str, Any]) -> str:
    """Build a comma-joined human-readable address from Photon's property fields."""
    parts: list[str] = []
    name = props.get("name")
    if name:
        parts.append(str(name))

    street = props.get("street")
    house = props.get("housenumber")
    if street:
        parts.append(f"{street} {house}" if house else str(street))

    for key in ("postcode", "district", "city", "county", "state", "country"):
        val = props.get(key)
        if val and val not in parts:
            parts.append(str(val))

    # Deduplicate consecutive repeats while preserving order
    out: list[str] = []
    for p in parts:
        if not out or out[-1] != p:
            out.append(p)
    return ", ".join(out)


async def search(query: str, limit: int = 6) -> list[dict[str, Any]]:
    """Return Nominatim-shaped rows so the existing router code is unchanged."""
    params: dict[str, Any] = {
        "q": query,
        "limit": limit,
        "lang": GEOCODER_LANG
    }
    if GEOCODER_BBOX:
        params["bbox"] = GEOCODER_BBOX
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(f"{GEOCODER_URL}/api/", params=params)
        resp.raise_for_status()
        body = resp.json()

    out: list[dict[str, Any]] = []
    for feat in body.get("features", []):
        coords = (feat.get("geometry") or {}).get("coordinates") or []
        if len(coords) < 2:
            continue
        lon, lat = coords[0], coords[1]
        props = feat.get("properties") or {}
        display_name = _display_name_from_props(props) or str(props.get("name", ""))
        out.append({
            "lat": str(lat),
            "lon": str(lon),
            "display_name": display_name
        })
    return out
