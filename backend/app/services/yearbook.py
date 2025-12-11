from datetime import datetime, timedelta
from typing import Optional, List, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import logging

from ..models.user import YearbookStats, UserToken
from .providers import DataProvider, GitHubProvider
from .filters import FilterStrategy, DateRangeFilter, YearFilter

logger = logging.getLogger(__name__)

class YearbookService:
    def __init__(self, db: AsyncSession, provider: DataProvider = None):
        self.db = db
        self.provider = provider or GitHubProvider()

    @staticmethod
    def parse_period(period: str) -> tuple[str, str]:
        """Parse period string into start and end dates."""
        today = datetime.utcnow().date()
        if period == "pastyear":
            start = today - timedelta(days=365)
            return start.isoformat(), today.isoformat()
        elif period == "pastmonth":
            start = today - timedelta(days=30)
            return start.isoformat(), today.isoformat()
        elif period == "pastweek":
            start = today - timedelta(days=7)
            return start.isoformat(), today.isoformat()
        elif period.isdigit() and len(period) == 4:
            return f"{period}-01-01", f"{period}-12-31"
        else:
            raise ValueError("Invalid period. Use YYYY, 'pastyear', 'pastmonth', or 'pastweek'.")

    async def get_stats(
        self, 
        username: str, 
        year: int, 
        token: Optional[str] = None, 
        start_date: Optional[str] = None, 
        end_date: Optional[str] = None,
        force_refresh: bool = False
    ) -> dict:
        """
        Main entry point. 
        If start_date and end_date are provided, treats as custom range (no DB cache).
        If only year is provided, uses DB cache (24h).
        """
        
        # 1. Determine Context (Custom Range vs Standard Year)
        is_custom_range = bool(start_date or end_date)
        target_start = start_date or f"{year}-01-01"
        target_end = end_date or f"{year}-12-31"

        # 2. Try Cache (Only for Standard Year)
        if not is_custom_range and not force_refresh:
            cached = await self._get_cached_stats(username, year)
            if cached:
                return cached

        # 3. Resolve Token
        if not token:
            token = await self._get_stored_token(username)

        # 4. Fetch Raw Data
        raw_data = await self.provider.fetch_contributions(username, target_start, target_end, token)
        
        # 5. Apply Filters (Validation/Enforcement)
        # Even though provider attempts to fetch range, we apply filter to ensure data consistency
        if is_custom_range:
            strategy = DateRangeFilter(target_start, target_end)
        else:
            strategy = YearFilter(year)
            
        filtered_data = strategy.apply(raw_data)
        
        # 6. Process Statistics (Calculate Streaks, etc.)
        # Move streak logic here or keep in a helper? 
        # For now, let's keep the streak calculation logic we had, but encapsulated.
        stats_model = self._process_stats(username, year, filtered_data)
        
        # 7. Save to Cache (Only for Standard Year)
        if not is_custom_range:
            await self._save_to_cache(stats_model)
            # Return dict format from model
            return self._model_to_dict(stats_model)
        else:
            # For custom range, just return the processed dict
            return self._model_to_dict(stats_model, is_cached=False)

    async def _get_cached_stats(self, username: str, year: int) -> Optional[dict]:
        stmt = (
            select(YearbookStats)
            .where(YearbookStats.username == username, YearbookStats.year == year)
            .order_by(YearbookStats.updated_at.desc())
        )
        result = await self.db.execute(stmt)
        rows = result.scalars().all()
        cached = rows[0] if rows else None

        # If duplicates exist, clean up older ones to avoid future conflicts
        if len(rows) > 1:
            for stale in rows[1:]:
                await self.db.delete(stale)
            await self.db.commit()
        
        if cached:
            # Check TTL (24h)
            if datetime.utcnow() - cached.updated_at < timedelta(hours=24):
                return self._model_to_dict(cached, is_cached=True)
            else:
                # Delete stale
                await self.db.delete(cached)
                await self.db.commit()
        return None

    async def _get_stored_token(self, username: str) -> Optional[str]:
        stmt = (
            select(UserToken)
            .where(UserToken.username == username, UserToken.is_valid == True)
            .order_by(UserToken.updated_at.desc())
        )
        result = await self.db.execute(stmt)
        rows = result.scalars().all()
        token_obj = rows[0] if rows else None
        # Clean duplicates if any (older rows)
        if len(rows) > 1:
            for stale in rows[1:]:
                await self.db.delete(stale)
            await self.db.commit()
        return token_obj.github_token if token_obj else None

    async def _save_to_cache(self, stats: YearbookStats):
        # Remove existing if any (double check to avoid collision on insert)
        existing = await self._get_cached_stats(stats.username, stats.year)
        if existing: 
            # If we are here, it means we decided to refresh, so we should have deleted it.
            # But just safe check
            pass # managing separate delete in _get_cached_stats logic for stale
            
        self.db.add(stats)
        await self.db.commit()

    def _process_stats(self, username: str, year: int, data: dict) -> YearbookStats:
        """Process raw dict into YearbookStats DB model."""
        daily = data.get("dailyContributions", [])
        active_days = [d for d in daily if d["count"] > 0]
        
        # Calculate streaks
        longest_streak = 0
        current_streak = 0
        streak = 0
        prev_date = None
        
        sorted_active = sorted(active_days, key=lambda x: x["date"])
        
        for d in sorted_active:
            cur_date = datetime.fromisoformat(d["date"])
            if prev_date and (cur_date - prev_date).days == 1:
                streak += 1
            else:
                longest_streak = max(longest_streak, streak)
                streak = 1
            prev_date = cur_date
        longest_streak = max(longest_streak, streak)
        
        # Current streak logic (simple version)
        # If we want simple current streak from END date backwards:
        if daily:
            daily_map = {d["date"]: d["count"] for d in daily}
            # Assuming data is sorted or contains the range end
            # We iterate backwards from the LAST available date in data
            dates = sorted(daily_map.keys())
            if dates:
                last_date = datetime.fromisoformat(dates[-1])
                curr = last_date
                run = 0
                while curr.strftime("%Y-%m-%d") in daily_map and daily_map[curr.strftime("%Y-%m-%d")] > 0:
                    run += 1
                    curr -= timedelta(days=1)
                current_streak = run
        
        return YearbookStats(
            username=username,
            year=year,
            avatar_url=data.get("avatarUrl"),
            bio=data.get("bio"),
            company=data.get("company"),
            location=data.get("location"),
            followers=data.get("followers", 0),
            following=data.get("following", 0),
            total_contributions=data.get("totalContributions", 0),
            total_commits=data.get("totalCommits", 0),
            pull_requests=data.get("pullRequests", 0),
            pull_request_reviews=data.get("pullRequestReviews", 0),
            issues=data.get("issues", 0),
            longest_streak=longest_streak,
            current_streak=current_streak,
            active_days=len(active_days),
            repo_count=len(data.get("repositoryContributions", [])),
            public_repo_count=data.get("publicRepos", 0),
            private_repo_count=data.get("privateRepos", 0),
            total_repo_count=data.get("totalRepos", 0),
            daily_contributions=daily,
            language_stats=data.get("languageStats", []),
            top_repos=data.get("repositoryContributions", []),
            organizations=data.get("organizations", []),
        )

    def _model_to_dict(self, stats: YearbookStats, is_cached: bool = False) -> dict:
        return {
            "username": stats.username,
            "year": stats.year,
            "avatarUrl": stats.avatar_url,
            "bio": stats.bio,
            "company": stats.company,
            "location": stats.location,
            "followers": stats.followers,
            "following": stats.following,
            "totalContributions": stats.total_contributions,
            "totalCommits": stats.total_commits,
            "pullRequests": stats.pull_requests,
            "pullRequestReviews": stats.pull_request_reviews,
            "issues": stats.issues,
            "longestStreak": stats.longest_streak,
            "currentStreak": stats.current_streak,
            "activeDays": stats.active_days,
            "repoCount": stats.repo_count,
            "publicRepoCount": stats.public_repo_count,
            "privateRepoCount": stats.private_repo_count,
            "totalRepoCount": stats.total_repo_count,
            "dailyContributions": stats.daily_contributions,
            "languageStats": stats.language_stats,
            "repositoryContributions": stats.top_repos,
            "organizations": stats.organizations,
            "cached": is_cached,
        }
