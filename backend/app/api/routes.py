from fastapi import APIRouter
from .endpoints import tokens_router, visits_router, stats_router, screenshots_router

router = APIRouter()

# Health Check (Keep here or move to separate?)
@router.get("/health")
async def health_check():
    return {"status": "ok"}

router.include_router(tokens_router, tags=["tokens"])
router.include_router(visits_router, tags=["visits"])
router.include_router(stats_router, tags=["stats"])
router.include_router(screenshots_router, tags=["screenshots"])
