from abc import ABC, abstractmethod
from typing import Any, Optional
from datetime import datetime
from .github import fetch_user_contributions

class DataProvider(ABC):
    """Abstract base class for data providers (e.g. GitHub, GitLab)."""
    
    @abstractmethod
    async def fetch_contributions(self, username: str, start_date: str, end_date: str, token: Optional[str] = None) -> dict[str, Any]:
        """Fetch raw contribution data."""
        pass

class GitHubProvider(DataProvider):
    """GitHub specific data fetching."""
    
    async def fetch_contributions(self, username: str, start_date: str, end_date: str, token: Optional[str] = None) -> dict[str, Any]:
        return await fetch_user_contributions(username, start_date, end_date, token)
