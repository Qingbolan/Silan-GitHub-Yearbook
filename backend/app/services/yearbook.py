import asyncio
from datetime import datetime, timedelta
from typing import Optional, List, Any
from sqlalchemy.ext.asyncio import AsyncSession

import logging

from ..models.user import YearbookStats, UserToken
from .providers import DataProvider, GitHubProvider
from .filters import FilterStrategy, DateRangeFilter, YearFilter

logger = logging.getLogger(__name__)

from ..repositories import TokenRepository, StatsRepository, UserRepository

class YearbookService:
    def __init__(self, db: AsyncSession, provider: DataProvider = None):
        self.db = db
        self.provider = provider or GitHubProvider()
        self.token_repo = TokenRepository(db)
        self.stats_repo = StatsRepository(db)
        self.user_repo = UserRepository(db)

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
        If start_date and end_date are provided, treats as custom range.
        Optimization: Custom ranges split into Year queries to maximize cache hits.
        """
        
        # 1. Determine Context (Custom Range vs Standard Year)
        is_custom_range = bool(start_date or end_date)
        target_start = start_date or f"{year}-01-01"
        target_end = end_date or f"{year}-12-31"

        # OPTIMIZATION: Smart Merge for Custom Ranges
        if is_custom_range:
            try:
                s_date = datetime.strptime(target_start, "%Y-%m-%d")
                e_date = datetime.strptime(target_end, "%Y-%m-%d")
                
                # Identify required years
                years = range(s_date.year, e_date.year + 1)
                
                # Fetch years in parallel
                tasks = [
                    self.get_stats(
                        username, 
                        y, 
                        token=token, 
                        force_refresh=force_refresh
                    )
                    for y in years
                ]
                year_stats_list = await asyncio.gather(*tasks)
                
                # Merge the yearly stats into the specific custom range
                return self._merge_stats_dicts(year_stats_list, target_start, target_end)

            except ValueError:
                # Fallback to original raw fetch if date parsing fails (unlikely)
                pass

        # 2. Try Cache (Only for Standard Year)
        if not is_custom_range and not force_refresh:
            cached = await self._get_cached_stats(username, year)
            if cached:
                return cached

        # 3. Resolve Token
        if not token:
            token_obj = await self.token_repo.get_by_username(username)
            token = token_obj.github_token if token_obj else None

        # 4. Fetch Raw Data
        raw_data = await self.provider.fetch_contributions(username, target_start, target_end, token)
        
        # Ensure User Record Exists (Auto-Create)
        await self.user_repo.create_or_update(
            username=raw_data.get("username", username),
            avatar_url=raw_data.get("avatarUrl"),
            bio=raw_data.get("bio"),
            company=raw_data.get("company"),
            location=raw_data.get("location"),
            followers=raw_data.get("followers", 0),
            following=raw_data.get("following", 0),
            public_repos=raw_data.get("publicRepos", 0)
        )
        
        # 5. Apply Filters (Validation/Enforcement)
        if is_custom_range:
            strategy = DateRangeFilter(target_start, target_end)
        else:
            strategy = YearFilter(year)
            
        filtered_data = strategy.apply(raw_data)
        
        # 6. Process Statistics
        stats_model = self._process_stats(username, year, filtered_data)
        
        # 7. Save to Cache (Only for Standard Year)
        if not is_custom_range:
            await self._save_to_cache(stats_model)
            return self._model_to_dict(stats_model)
        else:
            # Should not happen with Smart Merge, but as fallback
            return self._model_to_dict(stats_model, is_cached=False)

    async def _get_cached_stats(self, username: str, year: int) -> Optional[dict]:
        cached = await self.stats_repo.get_cached(username, year)
        if cached:
            # TTL Logic
            current_year = datetime.utcnow().year
            is_past_year = year < current_year
            
            # If past year, cache is valid for 30 days (essentially "forever" relative to session)
            # If current year, cache is valid for 24 hours
            ttl = timedelta(days=30) if is_past_year else timedelta(hours=24)
            
            if datetime.utcnow() - cached.updated_at < ttl:
                return self._model_to_dict(cached, is_cached=True)
            else:
                await self.stats_repo.delete(cached)
        return None

    def _merge_stats_dicts(self, stats_list: List[dict], start: str, end: str) -> dict:
        """Merge multiple yearly stats dicts into one custom range dict."""
        if not stats_list:
            return {}
            
        # Use the most recent year's profile info
        base = stats_list[-1].copy()
        
        # Filter and merge daily contributions
        all_days = []
        for s in stats_list:
            all_days.extend(s.get('dailyContributions', []))
            
        # Filter by range
        filtered_days = [
            d for d in all_days 
            if start <= d['date'] <= end
        ]
        
        # Recalculate totals and streaks based on filtered days
        active_days = [d for d in filtered_days if d['count'] > 0]
        total = sum(d['count'] for d in filtered_days)
        
        # Helper for streak calc (dup from _process_stats to avoid drift)
        longest = 0
        current = 0
        streak = 0
        prev_date = None
        
        sorted_active = sorted(active_days, key=lambda x: x['date'])
        for d in sorted_active:
            cur_d = datetime.strptime(d['date'], "%Y-%m-%d")
            if prev_date and (cur_d - prev_date).days == 1:
                streak += 1
            else:
                longest = max(longest, streak)
                streak = 1
            prev_date = cur_d
        longest = max(longest, streak)
        
        # Current streak (from end date backwards)
        daily_map = {d['date']: d['count'] for d in filtered_days}
        if daily_map:
            # Start checking from target_end (or actual last data point)
            curr = datetime.strptime(end, "%Y-%m-%d").date()
            # If end is in future, cap at today? Assuming end provided is valid.
            today = datetime.utcnow().date()
            if curr > today:
                curr = today
                
            run = 0
            while True:
                s_date = curr.strftime("%Y-%m-%d")
                if s_date in daily_map and daily_map[s_date] > 0:
                    run += 1
                    curr -= timedelta(days=1)
                elif s_date < start:
                    break # Out of bounds
                else:
                    # If we miss a day but it is AFTER the last data point?
                    # "Current streak" usually means "active streak ending separate from today".
                    # If today/yesterday is 0, current streak is 0? 
                    # Original logic was "backwards from LAST DATA DATE".
                    # Let's match original logic: backwards from sorted_active[-1] if exists
                    break
                    
            # Re-eval: simpler metric. Count backwards from 'end' IF 'end' has contribution?
            # Or use the "last active date" method.
            # Use "last active date" method to be robust.
            if sorted_active:
                last_active_date = datetime.strptime(sorted_active[-1]['date'], "%Y-%m-%d").date()
                # If last active date is too far from 'end' (gap > 1 day), current streak is 0?
                # Actually, standard is: Streak ends on last_active_date. 
                # Is it "Active Streak"?
                # Let's stick to: Count consecutive days ending at last_active_date.
                curr = last_active_date
                run = 0
                while curr.strftime("%Y-%m-%d") in daily_map and daily_map[curr.strftime("%Y-%m-%d")] > 0:
                     run += 1
                     curr -= timedelta(days=1)
                current = run

        # Merge Repo Lists (Deduplicate by name)
        # Use a dict keyed by name to keep unique
        all_repos = {}
        for s in stats_list:
            for r in s.get('repositoryContributions', []):
                # FIX: use 'repo' key as per GitHubProvider output, fallback to 'name'
                key = r.get('repo') or r.get('name')
                if key:
                    all_repos[key] = r
        # Sort merged repos by commit count (descending), then by stars as secondary sort
        merged_repos = sorted(
            all_repos.values(),
            key=lambda x: (x.get('count', 0), x.get('stars', 0)),
            reverse=True
        )

        # Update base
        base['totalContributions'] = total
        base['dailyContributions'] = filtered_days
        base['activeDays'] = len(active_days)
        base['longestStreak'] = longest
        base['currentStreak'] = current
        base['repositoryContributions'] = merged_repos
        base['repoCount'] = len(merged_repos)
        base['cached'] = all(s.get('cached', False) for s in stats_list) # True if all sources were cached
        
        # For languageStats, organizations, etc., we keep the latest year's snapshot 
        # as it is the most relevant representation of "Current Status".
        
        return base

    async def _save_to_cache(self, stats: YearbookStats):
        # We need to pass arguments to update_cache.
        # stats is a YearbookStats object.
        # Construct dict from it.
        data = {
            "username": stats.username,
            "year": stats.year,
            "avatar_url": stats.avatar_url,
            "bio": stats.bio,
            "company": stats.company,
            "location": stats.location,
            "followers": stats.followers,
            "following": stats.following,
            "total_contributions": stats.total_contributions,
            "total_commits": stats.total_commits,
            "pull_requests": stats.pull_requests,
            "pull_request_reviews": stats.pull_request_reviews,
            "issues": stats.issues,
            "longest_streak": stats.longest_streak,
            "current_streak": stats.current_streak,
            "active_days": stats.active_days,
            "repo_count": stats.repo_count,
            "public_repo_count": stats.public_repo_count,
            "private_repo_count": stats.private_repo_count,
            "total_repo_count": stats.total_repo_count,
            "daily_contributions": stats.daily_contributions,
            "language_stats": stats.language_stats,
            "top_repos": stats.top_repos,
            "organizations": stats.organizations,
        }
        await self.stats_repo.update_cache(data)

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
        # Sort repos by commit count (descending), then by stars as secondary sort
        sorted_repos = sorted(
            stats.top_repos or [],
            key=lambda x: (x.get('count', 0), x.get('stars', 0)),
            reverse=True
        )
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
            "repositoryContributions": sorted_repos,
            "organizations": stats.organizations,
            "cached": is_cached,
        }
