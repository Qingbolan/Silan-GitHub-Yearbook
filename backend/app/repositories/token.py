from typing import Optional, List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import UserToken
from app.repositories.base import BaseRepository


class TokenRepository(BaseRepository[UserToken]):
    def __init__(self, session: AsyncSession):
        super().__init__(session, UserToken)

    async def get_by_username(self, username: str) -> Optional[UserToken]:
        """Get the latest valid token for a user."""
        stmt = (
            select(UserToken)
            .where(UserToken.username == username, UserToken.is_valid == True)
            .order_by(UserToken.updated_at.desc())
        )
        result = await self.session.execute(stmt)
        rows = result.scalars().all()
        
        # Self-healing: remove duplicates if found
        if len(rows) > 1:
            for stale in rows[1:]:
                await self.session.delete(stale)
            await self.session.commit()
            
        return rows[0] if rows else None

    async def get_all_by_username(self, username: str) -> List[UserToken]:
        """Get all tokens for a user (valid or not)."""
        stmt = select(UserToken).where(UserToken.username == username)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def save_token(self, username: str, token: str) -> UserToken:
        """Create or update a token for a user."""
        existing = await self.get_by_username(username)
        if existing:
            existing.github_token = token
            existing.is_valid = True
            await self.session.commit()
            await self.session.refresh(existing)
            return existing
        return await self.create(username=username, github_token=token, is_valid=True)
