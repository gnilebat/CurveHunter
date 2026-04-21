from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import route, search, score

app = FastAPI(title="CurveHunter API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

app.include_router(route.router)
app.include_router(search.router)
app.include_router(score.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
