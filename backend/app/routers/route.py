from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services import graphhopper
from app.services.curvature import overall_curvature, segment_curvature

router = APIRouter()


class WaypointIn(BaseModel):
    lat: float
    lng: float
    name: str


class RouteRequest(BaseModel):
    start: WaypointIn
    end: WaypointIn
    prefer_curvy: bool = True


class RouteSegment(BaseModel):
    coordinates: list[list[float]]
    score: float
    length_km: float


class Instruction(BaseModel):
    text: str
    distance_m: float
    duration_s: float
    sign: int                      # GraphHopper turn code (-3..7)
    street_name: str | None
    interval: list[int]            # [start, end] indices into geometry


class RouteResponse(BaseModel):
    geometry: dict
    distance_m: float
    duration_s: float
    ascent_m: float
    descent_m: float
    curvature_score: float | None
    segments: list[RouteSegment]
    instructions: list[Instruction]


@router.post("/route", response_model=RouteResponse)
async def plan_route(req: RouteRequest):
    try:
        gh = await graphhopper.route(
            req.start.lat, req.start.lng,
            req.end.lat, req.end.lng,
            req.prefer_curvy
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Routing engine error: {e}")

    if not gh.get("paths"):
        raise HTTPException(status_code=404, detail="No route found")

    path = gh["paths"][0]
    coords = path["points"]["coordinates"]  # [[lng, lat, (z)], ...]
    coords_2d = [[c[0], c[1]] for c in coords]

    score, _ = overall_curvature(coords_2d)
    segments = segment_curvature(coords_2d, window_m=500.0)

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
        curvature_score=round(score, 1),
        segments=[RouteSegment(**s) for s in segments],
        instructions=instructions
    )
