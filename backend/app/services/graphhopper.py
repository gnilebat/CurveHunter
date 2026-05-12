"""GraphHopper routing client + dynamic custom-model builder."""
import httpx
import os
from typing import Any

GH_URL = os.environ["GRAPHHOPPER_URL"]


def build_custom_model(
    curviness: float,
    avoid_motorways: float,
    avoid_trunks: float,
    avoid_urban: float,
    ignore_urban_curves: bool,
    min_curve_speed: int
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

    # "Ignoriere Kurven Innerorts" — heavy routing penalty on urban roads.
    # Stacks with avoid_urban (multipliers compound).
    if ignore_urban_curves:
        priority.append({"if": "road_class == RESIDENTIAL",            "multiply_by": 0.25})
        priority.append({"if": "road_class == LIVING_STREET",          "multiply_by": 0.1})
        priority.append({"if": "max_speed > 0 && max_speed <= 50",     "multiply_by": 0.5})

    # "Mindesttempo für Kurven" — also push the router away from roads below the
    # threshold so the route actually reflects the score-filter intent.
    # Untagged roads (max_speed == 0) pass through unaffected, same as the score logic.
    if min_curve_speed > 0:
        priority.append({
            "if": f"max_speed > 0 && max_speed < {int(min_curve_speed)}",
            "multiply_by": 0.2
        })

    if curviness > 0:
        # Split into "normal" (0..1) and "extended" (1..2) phases so the
        # extended range really pushes the router off bigger roads.
        normal = min(curviness, 1.0)
        extra = max(0.0, curviness - 1.0)

        tert_boost = 1.0 + normal * 0.6 + extra * 1.2          # 1.0 → 1.6 → 2.8
        unc_boost  = tert_boost * 0.85
        priority.append({"if": "road_class == TERTIARY",     "multiply_by": tert_boost})
        priority.append({"if": "road_class == UNCLASSIFIED", "multiply_by": unc_boost})

        primary_factor = max(0.15, 1.0 - normal * 0.4 - extra * 0.4)  # 1.0 → 0.6 → 0.2
        priority.append({"if": "road_class == PRIMARY", "multiply_by": primary_factor})

        if extra > 0:
            sec_factor = max(0.4, 1.0 - extra * 0.5)            # only kicks in past 100%
            priority.append({"if": "road_class == SECONDARY", "multiply_by": sec_factor})

        # distance_influence: 70 (off) → 20 (100%) → 3 (200%)
        distance_influence = max(3, int(70 - normal * 50 - extra * 17))

    return {
        "priority": priority,
        "distance_influence": distance_influence
    }


def _is_default(curviness, avoid_motorways, avoid_trunks, avoid_urban,
                ignore_urban_curves, min_curve_speed) -> bool:
    return (
        curviness == 0 and avoid_motorways == 0 and avoid_trunks == 0
        and avoid_urban == 0 and not ignore_urban_curves and min_curve_speed == 0
    )


async def route(
    points: list[tuple[float, float]],   # [(lat, lng), ...] in order: start, vias…, end
    curviness: float,
    avoid_motorways: float,
    avoid_trunks: float,
    avoid_urban: float,
    ignore_urban_curves: bool,
    min_curve_speed: int
) -> dict[str, Any]:
    use_defaults = _is_default(
        curviness, avoid_motorways, avoid_trunks, avoid_urban,
        ignore_urban_curves, min_curve_speed
    )

    payload: dict[str, Any] = {
        "points": [[lng, lat] for (lat, lng) in points],
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
            curviness, avoid_motorways, avoid_trunks, avoid_urban,
            ignore_urban_curves, min_curve_speed
        )

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(f"{GH_URL}/route", json=payload)
        resp.raise_for_status()
        return resp.json()
