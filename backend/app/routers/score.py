from fastapi import APIRouter
from pydantic import BaseModel
import math

router = APIRouter()


class ScoreRequest(BaseModel):
    coordinates: list[list[float]]  # [[lng, lat], ...]


class ScoreResponse(BaseModel):
    curvature_score: float
    length_km: float
    rating: str


def _bearing(a: list[float], b: list[float]) -> float:
    lat1, lon1 = math.radians(a[1]), math.radians(a[0])
    lat2, lon2 = math.radians(b[1]), math.radians(b[0])
    dlon = lon2 - lon1
    x = math.sin(dlon) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    return math.degrees(math.atan2(x, y))


def _haversine_m(a: list[float], b: list[float]) -> float:
    R = 6_371_000
    lat1, lon1 = math.radians(a[1]), math.radians(a[0])
    lat2, lon2 = math.radians(b[1]), math.radians(b[0])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def compute_curvature(coords: list[list[float]]) -> tuple[float, float]:
    if len(coords) < 3:
        return 0.0, 0.0
    total_angle = 0.0
    total_dist_m = 0.0
    for i in range(1, len(coords) - 1):
        b1 = _bearing(coords[i - 1], coords[i])
        b2 = _bearing(coords[i], coords[i + 1])
        delta = abs(b2 - b1)
        if delta > 180:
            delta = 360 - delta
        total_angle += delta
        total_dist_m += _haversine_m(coords[i - 1], coords[i])
    total_dist_m += _haversine_m(coords[-2], coords[-1])
    length_km = total_dist_m / 1000
    score = total_angle / length_km if length_km > 0 else 0
    return score, length_km


@router.post("/score", response_model=ScoreResponse)
async def score_route(req: ScoreRequest):
    score, length_km = compute_curvature(req.coordinates)
    if score < 100:
        rating = "straight"
    elif score < 400:
        rating = "winding"
    elif score < 800:
        rating = "curvy"
    else:
        rating = "twisty"
    return ScoreResponse(curvature_score=round(score, 1), length_km=round(length_km, 2), rating=rating)
