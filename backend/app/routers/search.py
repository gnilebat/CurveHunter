from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel
from app.services import geocoder

router = APIRouter()


class SearchResult(BaseModel):
    lat: float
    lng: float
    name: str
    display_name: str


@router.get("/search", response_model=list[SearchResult])
async def search_places(q: str = Query(..., min_length=2)):
    try:
        results = await geocoder.search(q)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Geocoding error: {e}")

    return [
        SearchResult(
            lat=float(r["lat"]),
            lng=float(r["lon"]),
            name=r["display_name"].split(",")[0].strip(),
            display_name=r["display_name"]
        )
        for r in results
    ]
