from datetime import datetime
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.repositories import VisitRepository
from app.models.user import VisitLog

router = APIRouter()

class VisitCreate(BaseModel):
    target_username: str
    target_year: int
    visitor_country: str | None = None
    visitor_city: str | None = None
    visitor_lat: float | None = None
    visitor_lng: float | None = None
    visitor_fingerprint: str | None = None
    referer: str | None = None


@router.post("/visit")
async def log_visit(
    data: VisitCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Log a visit to a yearbook page with deduplication by fingerprint."""
    repo = VisitRepository(db)
    
    # Get IP from request
    forwarded = request.headers.get("x-forwarded-for")
    ip = forwarded.split(",")[0].strip() if forwarded else request.client.host if request.client else None

    # Check for duplicate visit using fingerprint
    if data.visitor_fingerprint:
        existing = await repo.find_recent_visit(data.visitor_fingerprint, data.target_username)
        if existing:
            return {"status": "ok", "visit_id": existing.id, "deduplicated": True}

    visit = await repo.create(
        target_username=data.target_username,
        target_year=data.target_year,
        visitor_ip=ip,
        visitor_fingerprint=data.visitor_fingerprint,
        visitor_country=data.visitor_country,
        visitor_city=data.visitor_city,
        visitor_lat=data.visitor_lat,
        visitor_lng=data.visitor_lng,
        visitor_user_agent=request.headers.get("user-agent"),
        referer=data.referer or request.headers.get("referer"),
    )

    return {"status": "ok", "visit_id": visit.id, "deduplicated": False}


@router.get("/visits/{username}")
async def get_visits(
    username: str,
    year: int | None = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
):
    """Get visit logs for a user."""
    # Since VisitRepository needs queries with filters, I'll rely on generic logic I should have added?
    # I didn't add filter support to VisitRepository.
    # For now, I'll access db via repo session or implement a specific method.
    # The original routes.py allows filtering by year.
    # I'll implement inline query here using repo.session for flexibility, 
    # or ideally update repository. But for speed, direct session access via `repo.session` is acceptable in "Endpoint Controller".
    # Wait, the point of repo is abstraction.
    # I'll use direct SQLAlchemy here for the complex query relying on models, 
    # but strictly speaking this belongs in the Repository.
    # I'll stick to direct SQLA here for now to avoid extending repo endlessly.
    from sqlalchemy import select, desc
    
    stmt = select(VisitLog).where(VisitLog.target_username == username)
    if year:
        stmt = stmt.where(VisitLog.target_year == year)
    stmt = stmt.order_by(desc(VisitLog.visited_at)).limit(limit)

    result = await db.execute(stmt)
    visits = result.scalars().all()

    return {
        "total": len(visits),
        "visits": [
            {
                "id": v.id,
                "year": v.target_year,
                "country": v.visitor_country,
                "city": v.visitor_city,
                "lat": v.visitor_lat,
                "lng": v.visitor_lng,
                "visited_at": v.visited_at.isoformat(),
            }
            for v in visits
        ],
    }


@router.get("/visits/{username}/stats")
async def get_visit_stats(
    username: str,
    year: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Get aggregated visit statistics."""
    from sqlalchemy import select, func, desc
    
    # Total visits
    total_stmt = select(func.count(VisitLog.id)).where(VisitLog.target_username == username)
    if year:
        total_stmt = total_stmt.where(VisitLog.target_year == year)
    total_result = await db.execute(total_stmt)
    total = total_result.scalar() or 0

    # Visits by country
    country_stmt = (
        select(VisitLog.visitor_country, func.count(VisitLog.id).label("count"))
        .where(VisitLog.target_username == username)
        .where(VisitLog.visitor_country.isnot(None))
        .group_by(VisitLog.visitor_country)
        .order_by(desc("count"))
        .limit(20)
    )
    if year:
        country_stmt = country_stmt.where(VisitLog.target_year == year)
    country_result = await db.execute(country_stmt)
    by_country = [{"country": row[0], "count": row[1]} for row in country_result.all()]

    # Recent visits with location for map
    map_stmt = (
        select(VisitLog)
        .where(VisitLog.target_username == username)
        .where(VisitLog.visitor_lat.isnot(None))
        .order_by(desc(VisitLog.visited_at))
        .limit(100)
    )
    if year:
        map_stmt = map_stmt.where(VisitLog.target_year == year)
    map_result = await db.execute(map_stmt)
    map_visits = map_result.scalars().all()

    return {
        "total": total,
        "by_country": by_country,
        "map_data": [
            {
                "lat": v.visitor_lat,
                "lng": v.visitor_lng,
                "city": v.visitor_city,
                "country": v.visitor_country,
                "visited_at": v.visited_at.isoformat(),
            }
            for v in map_visits
        ],
    }
