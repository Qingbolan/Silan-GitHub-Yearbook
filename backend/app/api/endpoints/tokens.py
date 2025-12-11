from datetime import datetime
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.repositories import TokenRepository

router = APIRouter()

class TokenCreate(BaseModel):
    username: str
    github_token: str
    token_type: str | None = None
    scopes: str | None = None


@router.post("/token")
async def save_token(
    data: TokenCreate,
    db: AsyncSession = Depends(get_db),
):
    """Save or update user's GitHub token."""
    repo = TokenRepository(db)
    await repo.save_token(data.username, data.github_token)
    # Note: repo implementation sets is_valid=True only. 
    # Logic in original route also updated scopes/token_type.
    # We should update repo to handle extended fields or just update here?
    # Better to update Repo method signature later. For now, strict compatibility.
    # Wait, save_token in repo only takes username/token.
    # I should have checked repo implementation. 
    # Let's fix this by updating the repo object after save (it returns the obj).
    # Or strict adherence: update repo to take kwargs.
    
    # Re-reading repo implementation: it hardcodes is_valid=True. 
    # I will stick to what is there for now, but in a real refactor I'd improve the repo.
    # Actually, token_type/scopes were added in original route.
    # The current repo implementation ignores them.
    # I will need to update the repository later or do manual update here.
    # Doing manual update here to ensure feature parity.
    
    token = await repo.get_by_username(data.username)
    if token:
        token.token_type = data.token_type
        token.scopes = data.scopes
        token.updated_at = datetime.utcnow()
        await db.commit()
    
    return {"status": "ok", "message": "Token saved"}


@router.get("/token/{username}")
async def get_token(
    username: str,
    db: AsyncSession = Depends(get_db),
):
    """Get user's stored token (masked)."""
    repo = TokenRepository(db)
    token = await repo.get_by_username(username)

    if not token:
        return {"exists": False}

    # Return masked token
    masked = token.github_token[:8] + "..." + token.github_token[-4:] if len(token.github_token) > 12 else "***"
    return {
        "exists": True,
        "masked_token": masked,
        "token_type": token.token_type,
        "scopes": token.scopes,
        "is_valid": token.is_valid,
        "updated_at": token.updated_at.isoformat() if token.updated_at else None,
    }


@router.delete("/token/{username}")
async def delete_token(
    username: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete user's stored token."""
    repo = TokenRepository(db)
    # Repo doesn't have delete_by_username, but has generic logic.
    # I'll manually handle deletion via repo or DB direct? NO, Repository pattern.
    # I need to find the token and delete it.
    tokens = await repo.get_all_by_username(username)
    for t in tokens:
        await repo.delete(t)

    return {"status": "ok", "message": "Token deleted"}
