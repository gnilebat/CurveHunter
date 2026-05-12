from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from app.services import graphhopper
from app.services.curvature import (
    overall_curvature, segment_curvature,
    build_urban_mask, build_highway_mask, build_speed_below_mask,
    build_class_mask, length_in_mask_m
)

router = APIRouter()


class WaypointIn(BaseModel):
    lat: float
    lng: float
    name: str


class RouteOptions(BaseModel):
    curviness: float = Field(0.7, ge=0.0, le=2.0)
    avoid_motorways: float = Field(0.8, ge=0.0, le=1.0)
    avoid_trunks: float = Field(0.4, ge=0.0, le=1.0)
    avoid_urban: float = Field(0.0, ge=0.0, le=1.0)
    ignore_urban_curves: bool = False
    min_curve_speed: int = Field(0, ge=0, le=200)  # km/h threshold; 0 = off


class RouteRequest(BaseModel):
    waypoints: list[WaypointIn] = Field(..., min_length=2)
    options: RouteOptions = RouteOptions()


class RouteSegment(BaseModel):
    coordinates: list[list[float]]
    score: float
    length_km: float
    is_urban: bool = False
    is_highway: bool = False
    is_below_speed: bool = False


class Instruction(BaseModel):
    text: str
    distance_m: float
    duration_s: float
    sign: int
    street_name: str | None
    interval: list[int]


class RouteResponse(BaseModel):
    geometry: dict
    distance_m: float
    duration_s: float
    ascent_m: float
    descent_m: float
    motorway_m: float
    trunk_m: float
    curvature_score: float | None
    segments: list[RouteSegment]
    instructions: list[Instruction]
    ignored_urban: bool


@router.post("/route", response_model=RouteResponse)
async def plan_route(req: RouteRequest):
    try:
        gh = await graphhopper.route(
            points=[(w.lat, w.lng) for w in req.waypoints],
            curviness=req.options.curviness,
            avoid_motorways=req.options.avoid_motorways,
            avoid_trunks=req.options.avoid_trunks,
            avoid_urban=req.options.avoid_urban,
            ignore_urban_curves=req.options.ignore_urban_curves,
            min_curve_speed=req.options.min_curve_speed
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Routing engine error: {e}")

    if not gh.get("paths"):
        raise HTTPException(status_code=404, detail="No route found")

    path = gh["paths"][0]
    coords = path["points"]["coordinates"]
    coords_2d = [[c[0], c[1]] for c in coords]

    # Per-coordinate urban mask from GraphHopper details
    details = path.get("details", {})
    n = len(coords_2d)
    urban_mask = build_urban_mask(
        n_coords=n,
        road_class_ranges=details.get("road_class", []),
        max_speed_ranges=details.get("max_speed", [])
    )
    highway_mask = build_highway_mask(
        n_coords=n,
        road_class_ranges=details.get("road_class", [])
    )
    motorway_mask = build_class_mask(n, details.get("road_class", []), {"motorway"})
    trunk_mask    = build_class_mask(n, details.get("road_class", []), {"trunk"})
    motorway_m = length_in_mask_m(coords_2d, motorway_mask)
    trunk_m    = length_in_mask_m(coords_2d, trunk_mask)
    speed_below_mask = build_speed_below_mask(
        n_coords=n,
        max_speed_ranges=details.get("max_speed", []),
        min_speed=req.options.min_curve_speed
    )

    # Combine score-filter masks: skip a vertex if EITHER filter applies
    use_urban_filter = req.options.ignore_urban_curves
    use_speed_filter = req.options.min_curve_speed > 0
    skip_mask = None
    if use_urban_filter or use_speed_filter:
        skip_mask = [
            (use_urban_filter and urban_mask[i]) or (use_speed_filter and speed_below_mask[i])
            for i in range(n)
        ]

    score, _ = overall_curvature(coords_2d, skip_mask=skip_mask)
    segments = segment_curvature(
        coords_2d,
        window_m=500.0,
        urban_mask=urban_mask,
        highway_mask=highway_mask,
        below_speed_mask=speed_below_mask if req.options.min_curve_speed > 0 else None
    )

    instructions = [
        Instruction(
            text=i.get("text", ""),
            distance_m=i.get("distance", 0),
            duration_s=i.get("time", 0) / 1000,
            sign=i.get("sign", 0),
            street_name=i.get("street_name") or None,
            interval=i.get("interval", [0, 0])
        )
        for i in path.get("instructions", [])
    ]

    return RouteResponse(
        geometry=path["points"],
        distance_m=path.get("distance", 0),
        duration_s=path.get("time", 0) / 1000,
        ascent_m=path.get("ascend", 0),
        descent_m=path.get("descend", 0),
        motorway_m=motorway_m,
        trunk_m=trunk_m,
        curvature_score=round(score, 1),
        segments=[RouteSegment(**s) for s in segments],
        instructions=instructions,
        ignored_urban=req.options.ignore_urban_curves
    )
