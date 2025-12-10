from datetime import datetime
from sqlalchemy import String, Integer, DateTime, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    bio: Mapped[str | None] = mapped_column(Text)
    company: Mapped[str | None] = mapped_column(String(200))
    location: Mapped[str | None] = mapped_column(String(200))
    followers: Mapped[int] = mapped_column(Integer, default=0)
    following: Mapped[int] = mapped_column(Integer, default=0)
    public_repos: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class YearbookStats(Base):
    __tablename__ = "yearbook_stats"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(100), index=True)
    year: Mapped[int] = mapped_column(Integer, index=True)

    # Contribution stats
    total_contributions: Mapped[int] = mapped_column(Integer, default=0)
    total_commits: Mapped[int] = mapped_column(Integer, default=0)
    pull_requests: Mapped[int] = mapped_column(Integer, default=0)
    pull_request_reviews: Mapped[int] = mapped_column(Integer, default=0)
    issues: Mapped[int] = mapped_column(Integer, default=0)

    # Streak stats
    longest_streak: Mapped[int] = mapped_column(Integer, default=0)
    current_streak: Mapped[int] = mapped_column(Integer, default=0)
    active_days: Mapped[int] = mapped_column(Integer, default=0)

    # Repo stats
    repo_count: Mapped[int] = mapped_column(Integer, default=0)
    public_repo_count: Mapped[int] = mapped_column(Integer, default=0)
    private_repo_count: Mapped[int] = mapped_column(Integer, default=0)

    # JSON data
    daily_contributions: Mapped[dict | None] = mapped_column(JSON)
    language_stats: Mapped[dict | None] = mapped_column(JSON)
    top_repos: Mapped[dict | None] = mapped_column(JSON)
    organizations: Mapped[dict | None] = mapped_column(JSON)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
