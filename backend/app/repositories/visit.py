from typing import Optional
from datetime import datetime, timedelta
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import VisitLog
from app.repositories.base import BaseRepository


class VisitRepository(BaseRepository[VisitLog]):
    def __init__(self, session: AsyncSession):
        super().__init__(session, VisitLog)

    async def find_recent_visit(self, visitor_fingerprint: str, target_username: str, minutes: int = 5) -> Optional[VisitLog]:
        """Find a recent visit to avoid duplicates."""
        since = datetime.utcnow() - timedelta(minutes=minutes)
        stmt = (
            select(VisitLog)
            .where(
                VisitLog.visitor_fingerprint == visitor_fingerprint,
                VisitLog.target_username == target_username,
                VisitLog.visited_at >= since,
            )
        )
        result = await self.session.execute(stmt)
        return result.scalars().first()

    async def get_recent_visits(self, limit: int = 50) -> list[VisitLog]:
        """Get latest visits."""
        stmt = select(VisitLog).order_by(VisitLog.visited_at.desc()).limit(limit)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
