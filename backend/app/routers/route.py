from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services import graphhopper

router = APIRouter()


class WaypointIn(BaseModel):
    lat: float
    lng: float
    name: str


class RouteRequest(BaseModel):
    start: WaypointIn
    end: WaypointIn
    prefer_curvy: bool = True


class RouteResponse(BaseModel):
    geometry: dict
    distance_m: float
    duration_s: float
    ascent_m: float
    descent_m: float
    curvature_score: float | None


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
    return RouteResponse(
        geometry=path["points"],
        distance_m=path.get("distance", 0),
        duration_s=path.get("time", 0) / 1000,
        ascent_m=path.get("ascend", 0),
        descent_m=path.get("descend", 0),
        curvature_score=None  # populated by Phase 2 score endpoint
    )
