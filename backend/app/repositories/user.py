from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime

from app.models.user import User
from app.repositories.base import BaseRepository


class UserRepository(BaseRepository[User]):
    def __init__(self, session: AsyncSession):
        super().__init__(session, User)

    async def get_by_username(self, username: str) -> Optional[User]:
        """Get user by username."""
        stmt = select(User).where(User.username == username)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def create_or_update(self, username: str, **kwargs) -> User:
        """Create or update a user."""
        current_user = await self.get_by_username(username)
        if current_user:
            for key, value in kwargs.items():
                if hasattr(current_user, key):
                    setattr(current_user, key, value)
            current_user.updated_at = datetime.utcnow()
            await self.session.commit()
            await self.session.refresh(current_user)
            return current_user
        
        # Create new
        # Filter kwargs to only those in the model
        valid_keys = [c.key for c in User.__table__.columns]
        filtered_kwargs = {k: v for k, v in kwargs.items() if k in valid_keys and k != 'id'}
        
        return await self.create(username=username, **filtered_kwargs)
