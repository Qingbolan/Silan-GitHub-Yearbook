from datetime import datetime
import math
import html
import markdown
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services.yearbook import YearbookService
from app.models.user import YearbookStats

router = APIRouter()

@router.get("/stats/{username}/{year}")
async def get_yearbook_stats(
    username: str,
    year: int,
    token: str | None = None,
    start: str | None = None,
    end: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Get yearbook stats for a user and year (or custom range)."""
    
    try:
        # Instantiate Service
        service = YearbookService(db)
        
        # Determine date range
        start_date = start if start else None
        end_date = end if end else None

        data = await service.get_stats(
            username=username, 
            year=year, 
            token=token, 
            start_date=start_date, 
            end_date=end_date
        )
        return data
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/stats/{username}/{year}/refresh")
async def refresh_yearbook_stats(
    username: str,
    year: int,
    token: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Force refresh yearbook stats from GitHub."""
    service = YearbookService(db)
    return await service.get_stats(username, year, token, force_refresh=True)

# Helper function
def generate_stats_svg(stats: YearbookStats) -> str:
    # ... Implementation needed? 
    # Actually SVG routes seem to have been removed or weren't in the split plan explicitly,
    # but the logic was in routes.py under "SVG Card Generation" but NOT exposed as an endpoint?
    # Ah, I see `get_stats_card` (png) but no `get_svg_card` endpoint in the provided routes.py content.
    # The function `generate_stats_svg` existed but wasn't used by a route in `routes.py`?
    # Wait, let me check `routes.py` again. 
    # It defines `generate_stats_svg` but I don't see any @router.get using it.
    # Lines 318-510 define it. But lines 513 start `get_embed`.
    # It seems unused! Or maybe I missed where it was called.
    # I will verify usage. If unused, I won't port it.
    pass
