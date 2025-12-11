from datetime import datetime, timedelta
import markdown
import html
import math
from pathlib import Path
from urllib.parse import quote
from playwright.async_api import async_playwright
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response, RedirectResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc

from ..core.database import get_db
from ..core.database import get_db
from ..models.user import User, YearbookStats, VisitLog, UserToken
from ..services.yearbook import YearbookService

router = APIRouter()


# ============== Pydantic Models ==============

class TokenCreate(BaseModel):
    username: str
    github_token: str
    token_type: str | None = None
    scopes: str | None = None


class VisitCreate(BaseModel):
    target_username: str
    target_year: int
    visitor_country: str | None = None
    visitor_city: str | None = None
    visitor_lat: float | None = None
    visitor_lng: float | None = None
    visitor_fingerprint: str | None = None
    referer: str | None = None


# ============== Health Check ==============

@router.get("/health")
async def health_check():
    return {"status": "ok"}


# ============== Token Management ==============

@router.post("/token")
async def save_token(
    data: TokenCreate,
    db: AsyncSession = Depends(get_db),
):
    """Save or update user's GitHub token."""
    stmt = select(UserToken).where(UserToken.username == data.username).order_by(UserToken.updated_at.desc())
    result = await db.execute(stmt)
    rows = result.scalars().all()
    existing = rows[0] if rows else None
    # Clean duplicates if any
    if len(rows) > 1:
        for stale in rows[1:]:
            await db.delete(stale)
        await db.commit()

    if existing:
        existing.github_token = data.github_token
        existing.token_type = data.token_type
        existing.scopes = data.scopes
        existing.is_valid = True
        existing.updated_at = datetime.utcnow()
    else:
        token = UserToken(
            username=data.username,
            github_token=data.github_token,
            token_type=data.token_type,
            scopes=data.scopes,
        )
        db.add(token)

    await db.commit()
    return {"status": "ok", "message": "Token saved"}


@router.get("/token/{username}")
async def get_token(
    username: str,
    db: AsyncSession = Depends(get_db),
):
    """Get user's stored token (masked)."""
    stmt = select(UserToken).where(UserToken.username == username).order_by(UserToken.updated_at.desc())
    result = await db.execute(stmt)
    token = result.scalars().first()

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
    stmt = select(UserToken).where(UserToken.username == username)
    result = await db.execute(stmt)
    tokens = result.scalars().all()
    if tokens:
        for t in tokens:
            await db.delete(t)
        await db.commit()

    return {"status": "ok", "message": "Token deleted"}


# ============== Visit Logging ==============

@router.post("/visit")
async def log_visit(
    data: VisitCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Log a visit to a yearbook page with deduplication by fingerprint."""
    # Get IP from request
    forwarded = request.headers.get("x-forwarded-for")
    ip = forwarded.split(",")[0].strip() if forwarded else request.client.host if request.client else None

    # Check for duplicate visit using fingerprint (within last 5 minutes)
    if data.visitor_fingerprint:
        five_minutes_ago = datetime.utcnow() - timedelta(minutes=5)
        stmt = select(VisitLog).where(
            VisitLog.target_username == data.target_username,
            VisitLog.target_year == data.target_year,
            VisitLog.visitor_fingerprint == data.visitor_fingerprint,
            VisitLog.visited_at >= five_minutes_ago,
        )
        result = await db.execute(stmt)
        existing = result.scalars().first()
        if existing:
            # Return existing visit instead of creating duplicate
            return {"status": "ok", "visit_id": existing.id, "deduplicated": True}

    visit = VisitLog(
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
    db.add(visit)
    await db.commit()

    return {"status": "ok", "visit_id": visit.id, "deduplicated": False}


@router.get("/visits/{username}")
async def get_visits(
    username: str,
    year: int | None = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
):
    """Get visit logs for a user."""
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
    base_stmt = select(VisitLog).where(VisitLog.target_username == username)
    if year:
        base_stmt = base_stmt.where(VisitLog.target_year == year)

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


# ============== Yearbook Stats ==============

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
    
    # Instantiate Service
    service = YearbookService(db)
    
    # Determine date range
    start_date = start if start else None
    end_date = end if end else None

    try:
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
    """Force refresh yearbook stats from GitHub."""
    service = YearbookService(db)
    return await service.get_stats(username, year, token, force_refresh=True)


# ============== SVG Card Generation ==============

def generate_stats_svg(stats: YearbookStats) -> str:
    """Generate SVG card for yearbook stats."""
    username = stats.username
    year = stats.year

    # Get top languages (up to 6)
    languages = stats.language_stats[:6] if stats.language_stats else []
    lang_bars = ""
    lang_legend = ""
    x_offset = 0
    for i, lang in enumerate(languages):
        width = lang.get("percentage", 0) * 4.5  # Scale to fit ~450px
        color = lang.get("color", "#8b949e")
        lang_bars += f'<rect x="{x_offset}" y="0" width="{width}" height="8" fill="{color}" rx="0"/>'
        x_offset += width
        # Full language name without truncation; align percentage to the right to avoid overlap
        name = lang.get("name", "")
        # Legend - 2 columns layout
        lang_legend += f'''
        <g transform="translate({(i % 2) * 220}, {(i // 2) * 18})">
            <circle cx="4" cy="5" r="4" fill="{color}"/>
            <text x="14" y="9" fill="#8b949e" font-size="11">{name}</text>
            <text x="200" y="9" fill="#58a6ff" font-size="11" text-anchor="end">{lang.get("percentage", 0):.1f}%</text>
        </g>'''

    # Get weekly activity (last 52 weeks)
    daily = stats.daily_contributions or []
    if not daily:
        weeks = [0] * 52
        max_w = 1
    else:
        # Sort daily to find the latest date
        daily.sort(key=lambda x: x["date"])
        last_date_str = daily[-1]["date"]
        last_date = datetime.fromisoformat(last_date_str)
        
        week_map = {}
        for d in daily:
            date = datetime.fromisoformat(d["date"])
            days_diff = (last_date - date).days
            week_idx = 51 - (days_diff // 7)
            if 0 <= week_idx < 52:
                week_map[week_idx] = week_map.get(week_idx, 0) + d["count"]

        weeks = [week_map.get(i, 0) for i in range(52)]
    max_w = max(weeks) if weeks else 1
    activity_bars = ""
    bar_width = 8
    gap = 1
    for i, w in enumerate(weeks):
        opacity = 0.15 + (w / max_w) * 0.85 if w > 0 else 0.08
        activity_bars += f'<rect x="{i * (bar_width + gap)}" y="0" width="{bar_width}" height="16" fill="rgba(63,185,80,{opacity:.2f})" rx="1"/>'

    # Render Bio with Markdown
    bio_html = ""
    bio_height = 0
    if stats.bio:
        # Escape any raw HTML first, then convert Markdown to XHTML to satisfy XML parser in SVG
        safe_bio = html.escape(stats.bio)
        html_content = markdown.markdown(safe_bio, output_format="xhtml1")
        # Estimate required height based on character count (approx. 70 chars per line at 12px)
        avg_chars_per_line = 70
        line_height = 18
        num_lines = max(1, math.ceil(len(safe_bio) / avg_chars_per_line))
        bio_content_height = num_lines * line_height
        bio_height = bio_content_height + 10
        # Add basic styling for the bio
        bio_html = f'''
        <g transform="translate(20, 58)">
            <foreignObject width="455" height="{bio_content_height}">
                <body xmlns="http://www.w3.org/1999/xhtml" style="margin: 0; padding: 0; background: transparent;">
                    <style>
                        p {{ margin: 0; color: #8b949e; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; font-size: 12px; line-height: 1.5; }}
                        a {{ color: #58a6ff; text-decoration: none; }}
                        a:hover {{ text-decoration: underline; }}
                    </style>
                    <div>
                        {html_content}
                    </div>
                </body>
            </foreignObject>
        </g>'''

    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 495 {320 + bio_height}" preserveAspectRatio="xMidYMid meet" style="width:100%;height:auto;">
  <defs>
    <style>
      .header {{ font: 600 18px "Segoe UI", Ubuntu, Sans-Serif; fill: #ffffff; }}
      .stat-label {{ font: 400 10px "Segoe UI", Ubuntu, Sans-Serif; fill: #8b949e; }}
      .stat-value {{ font: 600 14px "Segoe UI", Ubuntu, Sans-Serif; }}
      .section-title {{ font: 600 10px "Segoe UI", Ubuntu, Sans-Serif; fill: #8b949e; text-transform: uppercase; letter-spacing: 0.5px; }}
    </style>
  </defs>

  <!-- Background -->
  <rect width="495" height="{320 + bio_height}" fill="#0d1117" rx="6"/>
  <rect x="0.5" y="0.5" width="494" height="{319 + bio_height}" fill="none" stroke="#30363d" rx="6"/>

  <!-- Header -->
  <g transform="translate(20, 28)">
    <text class="header">{username}</text>
    <rect x="{len(username) * 11 + 8}" y="0" width="40" height="20" fill="#21262d" rx="4"/>
    <text x="{len(username) * 11 + 14}" y="14" fill="#8b949e" font-size="12">{year}</text>
  </g>

  <!-- Bio -->
  {bio_html}

  <!-- Stats Row -->
  <g transform="translate(20, {58 + bio_height})">
    <g>
      <text class="stat-value" fill="#3fb950">{stats.total_contributions:,}</text>
      <text class="stat-label" y="15">Contributions</text>
    </g>
    <g transform="translate(85, 0)">
      <text class="stat-value" fill="#58a6ff">{stats.total_commits:,}</text>
      <text class="stat-label" y="15">Commits</text>
    </g>
    <g transform="translate(155, 0)">
      <text class="stat-value" fill="#a371f7">{stats.pull_requests}</text>
      <text class="stat-label" y="15">PRs</text>
    </g>
    <g transform="translate(200, 0)">
      <text class="stat-value" fill="#f0883e">{stats.pull_request_reviews}</text>
      <text class="stat-label" y="15">Reviews</text>
    </g>
    <g transform="translate(260, 0)">
      <text class="stat-value" fill="#3fb950">{stats.issues}</text>
      <text class="stat-label" y="15">Issues</text>
    </g>
    <g transform="translate(310, 0)">
      <text class="stat-value" fill="#f97316">{stats.longest_streak}d</text>
      <text class="stat-label" y="15">Streak</text>
    </g>
    <g transform="translate(365, 0)">
      <text class="stat-value" fill="#3fb950">{stats.active_days}</text>
      <text class="stat-label" y="15">Active</text>
    </g>
    <g transform="translate(420, 0)">
      <text class="stat-value" fill="#58a6ff">{stats.repo_count}</text>
      <text class="stat-label" y="15">Repos</text>
    </g>
  </g>

  <!-- Activity Graph (52 weeks) -->
  <g transform="translate(20, {95 + bio_height})">
    <text class="section-title">Activity</text>
    <g transform="translate(0, 14)">
      {activity_bars}
    </g>
  </g>

  <!-- Language Bar -->
  <g transform="translate(20, {145 + bio_height})">
    <text class="section-title">Languages</text>
    <g transform="translate(0, 14)">
      <rect width="455" height="8" fill="#161b22" rx="4"/>
      <clipPath id="lang-clip">
        <rect width="455" height="8" rx="4"/>
      </clipPath>
      <g clip-path="url(#lang-clip)">
        {lang_bars}
      </g>
    </g>
    <g transform="translate(0, 30)">
      {lang_legend}
    </g>
  </g>

  <!-- Repos Info -->
  <g transform="translate(20, {250 + bio_height})">
    <text class="section-title">Repositories</text>
    <g transform="translate(0, 18)">
      <text fill="#c9d1d9" font-size="12">
        <tspan fill="#58a6ff" font-weight="600">{stats.public_repo_count}</tspan>
        <tspan fill="#8b949e"> public</tspan>
        <tspan fill="#484f58"> · </tspan>
        <tspan fill="#f0883e" font-weight="600">{stats.private_repo_count}</tspan>
        <tspan fill="#8b949e"> private</tspan>
        <tspan fill="#484f58"> · </tspan>
        <tspan fill="#a371f7" font-weight="600">{stats.total_repo_count}</tspan>
        <tspan fill="#8b949e"> total</tspan>
      </text>
    </g>
  </g>

  <!-- Footer -->
  <g transform="translate(20, {305 + bio_height})">
    <text fill="#484f58" font-size="10">@silan-github-yearbook · {datetime.utcnow().strftime("%Y-%m-%d")}</text>
  </g>
</svg>'''

    return svg



@router.get("/embed/{username}/{period}")
async def get_embed(username: str, period: str):
    """Redirect to embeddable frontend view."""
    try:
        start, end = YearbookService.parse_period(period)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    display_title = period
    if period in ["pastyear", "pastmonth", "pastweek"]:
        display_title = period.replace("past", "Past ").title()
        
    return RedirectResponse(f"/yearbook/{username}/{start}/{end}?embed=1&screenshot=1&title={quote(display_title)}")


@router.get("/card/{username}/{start}/{end}")
async def get_stats_card(
    username: str,
    start: str,
    end: str,
    width: int = 1280,
    db: AsyncSession = Depends(get_db),
):
    """Generate PNG card (screenshot of frontend) for yearbook stats."""
    return await generate_screenshot(username, start, end, width)


@router.get("/screenshot/{username}/{period}")
async def get_screenshot(
    username: str,
    period: str,
    width: int = 1280,
    db: AsyncSession = Depends(get_db),
):
    """Generate PNG screenshot for a period."""
    try:
        start, end = YearbookService.parse_period(period)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    return await generate_screenshot(username, start, end, width)


async def generate_screenshot(username: str, start: str, end: str, width: int = 1280):
    """Shared screenshot generation logic."""
    # Extract year from start date (rough approximation for cache key)
    year = int(start[:4])
    cache_dir = Path("backend/cache")
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_file = cache_dir / f"{username}_{year}_{start}_{end}_{width}.png"

    # Check cache (30 minute TTL)
    if cache_file.exists():
        mtime = datetime.fromtimestamp(cache_file.stat().st_mtime)
        if datetime.now() - mtime < timedelta(minutes=30):
            return Response(
                content=cache_file.read_bytes(),
                media_type="image/png",
                headers={
                    "Cache-Control": "public, max-age=1800",
                    "Content-Type": "image/png",
                }
            )

    # Use running dev server for rendering to avoid CORS issues with file://
    # This requires 'npm run dev' to be running on port 5173
    file_url = f"http://localhost:5173/yearbook/{username}/{start}/{end}?screenshot=1"

    # Use Playwright to render the page
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox"])
        try:
            # Create context with appropriate viewport
            context = await browser.new_context(
                viewport={"width": width, "height": 1200}, # Taller viewport for full content
                device_scale_factor=2,
            )
            page = await context.new_page()
            
            # Go to page and wait for network idle to ensure data is fetching
            await page.goto(file_url, wait_until="networkidle", timeout=60000)
            
            # Wait for the specific target element to be ready
            # We target #screenshot-target which wraps Card + Map
            await page.wait_for_selector("#screenshot-target", state="attached", timeout=60000)
            
            # Brief pause to ensure all charts/maps are fully rendered/animated
            await page.wait_for_timeout(2000)
            
            element = await page.query_selector("#screenshot-target")
            if not element:
                raise HTTPException(status_code=500, detail="Card element not found in frontend page.")
            
            png_bytes = await element.screenshot(type="png")
            
            # Save to cache
            cache_file.write_bytes(png_bytes)
            
            return Response(
                content=png_bytes,
                media_type="image/png",
                headers={
                    "Cache-Control": "public, max-age=1800",
                    "Content-Type": "image/png",
                }
            )
        except Exception as e:
            print(f"Error generating screenshot: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to generate card: {str(e)}")
        finally:
            await browser.close()

