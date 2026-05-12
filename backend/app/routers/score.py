from fastapi import APIRouter
from pydantic import BaseModel
from app.services.curvature import overall_curvature

router = APIRouter()


class ScoreRequest(BaseModel):
    coordinates: list[list[float]]


class ScoreResponse(BaseModel):
    curvature_score: float
    length_km: float
    rating: str


def _rating(score: float) -> str:
    if score < 100: return "straight"
    if score < 400: return "winding"
    if score < 800: return "curvy"
    return "twisty"


@router.post("/score", response_model=ScoreResponse)
async def score_route(req: ScoreRequest):
    score, length_km = overall_curvature(req.coordinates)
    return ScoreResponse(
        curvature_score=round(score, 1),
        length_km=round(length_km, 2),
        rating=_rating(score)
    )
