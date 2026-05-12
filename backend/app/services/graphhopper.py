"""GraphHopper routing client + dynamic custom-model builder."""
import httpx
import os
from typing import Any

GH_URL = os.environ["GRAPHHOPPER_URL"]


def build_custom_model(
    curviness: float,
    avoid_motorways: float,
    avoid_trunks: float,
    avoid_urban: float
) -> dict[str, Any]:
    """Translate slider values (0.0–1.0) into a GraphHopper custom-model JSON."""
    priority: list[dict[str, Any]] = []
    distance_influence = 70

    if avoid_motorways > 0:
        mult = max(0.02, 1.0 - avoid_motorways * 0.98)
        priority.append({"if": "road_class == MOTORWAY", "multiply_by": mult})

    if avoid_trunks > 0:
        mult = max(0.05, 1.0 - avoid_trunks * 0.95)
        priority.append({"if": "road_class == TRUNK", "multiply_by": mult})

    if avoid_urban > 0:
        res_mult = max(0.1, 1.0 - avoid_urban * 0.9)
        living_mult = max(0.05, 1.0 - avoid_urban * 0.95)
        speed_mult = max(0.4, 1.0 - avoid_urban * 0.6)
        priority.append({"if": "road_class == RESIDENTIAL", "multiply_by": res_mult})
        priority.append({"if": "road_class == LIVING_STREET", "multiply_by": living_mult})
        priority.append({"if": "max_speed > 0 && max_speed <= 50", "multiply_by": speed_mult})

    if curviness > 0:
        boost = 1.0 + curviness * 0.6
        priority.append({"if": "road_class == TERTIARY",     "multiply_by": boost})
        priority.append({"if": "road_class == UNCLASSIFIED", "multiply_by": boost * 0.85})
        primary_factor = max(0.5, 1.0 - curviness * 0.4)
        priority.append({"if": "road_class == PRIMARY", "multiply_by": primary_factor})
        distance_influence = int(70 - curviness * 50)

    return {
        "priority": priority,
        "distance_influence": distance_influence
    }


def _is_default(curviness, avoid_motorways, avoid_trunks, avoid_urban) -> bool:
    return curviness == 0 and avoid_motorways == 0 and avoid_trunks == 0 and avoid_urban == 0


async def route(
    start_lat: float, start_lng: float,
    end_lat: float, end_lng: float,
    curviness: float,
    avoid_motorways: float,
    avoid_trunks: float,
    avoid_urban: float
) -> dict[str, Any]:
    use_defaults = _is_default(curviness, avoid_motorways, avoid_trunks, avoid_urban)

    payload: dict[str, Any] = {
        "points": [[start_lng, start_lat], [end_lng, end_lat]],
        "points_encoded": False,
        "instructions": True,
        "elevation": True,
        "locale": "en",
        # Per-edge details so the backend can flag urban segments
        "details": ["road_class", "max_speed"]
    }

    if use_defaults:
        payload["profile"] = "motorcycle"
    else:
        payload["profile"] = "motorcycle_curvy"
        payload["ch.disable"] = True
        payload["custom_model"] = build_custom_model(
            curviness, avoid_motorways, avoid_trunks, avoid_urban
        )

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(f"{GH_URL}/route", json=payload)
        resp.raise_for_status()
        return resp.json()
