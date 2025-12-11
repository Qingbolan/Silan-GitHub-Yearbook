from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import YearbookStats
from app.repositories.base import BaseRepository


class StatsRepository(BaseRepository[YearbookStats]):
    def __init__(self, session: AsyncSession):
        super().__init__(session, YearbookStats)

    async def get_cached(self, username: str, year: int) -> Optional[YearbookStats]:
        """Get cached stats for a user and year/period."""
        stmt = (
            select(YearbookStats)
            .where(YearbookStats.username == username, YearbookStats.year == year)
            .order_by(YearbookStats.updated_at.desc())
        )
        result = await self.session.execute(stmt)
        rows = result.scalars().all()
        
        # Self-healing: match the logic in previous inline code
        if len(rows) > 1:
            for stale in rows[1:]:
                await self.session.delete(stale)
            await self.session.commit()
            
        return rows[0] if rows else None

    async def update_cache(self, stats_data: dict) -> YearbookStats:
        """Update or create cached stats."""
        # Check existence first
        cached = await self.get_cached(stats_data["username"], stats_data["year"])
        if cached:
            # Update fields
            for key, value in stats_data.items():
                if hasattr(cached, key):
                    setattr(cached, key, value)
            await self.session.commit()
            await self.session.refresh(cached)
            return cached
        else:
            # Create new
            return await self.create(**stats_data)
