from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..core.database import get_db
from ..models.user import User, YearbookStats
from ..services.github import fetch_user_contributions

router = APIRouter()


@router.get("/health")
async def health_check():
    return {"status": "ok"}


@router.get("/stats/{username}/{year}")
async def get_yearbook_stats(
    username: str,
    year: int,
    token: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Get yearbook stats for a user and year."""
    # Check cache first
    stmt = select(YearbookStats).where(
        YearbookStats.username == username,
        YearbookStats.year == year,
    )
    result = await db.execute(stmt)
    cached = result.scalar_one_or_none()

    if cached:
        return {
            "username": cached.username,
            "year": cached.year,
            "totalContributions": cached.total_contributions,
            "totalCommits": cached.total_commits,
            "pullRequests": cached.pull_requests,
            "pullRequestReviews": cached.pull_request_reviews,
            "issues": cached.issues,
            "longestStreak": cached.longest_streak,
            "currentStreak": cached.current_streak,
            "activeDays": cached.active_days,
            "repoCount": cached.repo_count,
            "dailyContributions": cached.daily_contributions,
            "languageStats": cached.language_stats,
            "topRepos": cached.top_repos,
            "organizations": cached.organizations,
            "cached": True,
        }

    # Fetch from GitHub
    start_date = f"{year}-01-01"
    end_date = f"{year}-12-31"

    try:
        data = await fetch_user_contributions(username, start_date, end_date, token)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Calculate streaks
    daily = data.get("dailyContributions", [])
    active_days = [d for d in daily if d["count"] > 0]

    longest_streak = 0
    current_streak = 0
    streak = 0
    prev_date = None

    for d in sorted(active_days, key=lambda x: x["date"]):
        from datetime import datetime, timedelta
        cur_date = datetime.fromisoformat(d["date"])
        if prev_date and (cur_date - prev_date).days == 1:
            streak += 1
        else:
            longest_streak = max(longest_streak, streak)
            streak = 1
        prev_date = cur_date
    longest_streak = max(longest_streak, streak)

    # Calculate current streak (from end of year backwards)
    active_dates = set(d["date"] for d in active_days)
    from datetime import datetime, timedelta
    end_d = datetime(year, 12, 31)
    for i in range(365):
        d = end_d - timedelta(days=i)
        if d.strftime("%Y-%m-%d") in active_dates:
            current_streak += 1
        elif i > 0:
            break

    # Save to database
    stats = YearbookStats(
        username=username,
        year=year,
        total_contributions=data.get("totalContributions", 0),
        total_commits=data.get("totalCommits", 0),
        pull_requests=data.get("pullRequests", 0),
        pull_request_reviews=data.get("pullRequestReviews", 0),
        issues=data.get("issues", 0),
        longest_streak=longest_streak,
        current_streak=current_streak,
        active_days=len(active_days),
        repo_count=len(data.get("repositoryContributions", [])),
        daily_contributions=daily,
        language_stats=data.get("languageStats", []),
        top_repos=data.get("repositoryContributions", [])[:10],
        organizations=data.get("organizations", []),
    )
    db.add(stats)
    await db.commit()

    return {
        "username": username,
        "year": year,
        "totalContributions": stats.total_contributions,
        "totalCommits": stats.total_commits,
        "pullRequests": stats.pull_requests,
        "pullRequestReviews": stats.pull_request_reviews,
        "issues": stats.issues,
        "longestStreak": stats.longest_streak,
        "currentStreak": stats.current_streak,
        "activeDays": stats.active_days,
        "repoCount": stats.repo_count,
        "dailyContributions": stats.daily_contributions,
        "languageStats": stats.language_stats,
        "topRepos": stats.top_repos,
        "organizations": stats.organizations,
        "cached": False,
    }


@router.post("/stats/{username}/{year}/refresh")
async def refresh_yearbook_stats(
    username: str,
    year: int,
    token: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Force refresh yearbook stats from GitHub."""
    # Delete existing cache
    stmt = select(YearbookStats).where(
        YearbookStats.username == username,
        YearbookStats.year == year,
    )
    result = await db.execute(stmt)
    cached = result.scalar_one_or_none()
    if cached:
        await db.delete(cached)
        await db.commit()

    # Fetch fresh data
    return await get_yearbook_stats(username, year, token, db)
