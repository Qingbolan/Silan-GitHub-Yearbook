import httpx
from datetime import datetime
from typing import Any

GITHUB_GRAPHQL_URL = "https://api.github.com/graphql"


async def fetch_user_latest_push_time(username: str, token: str | None = None) -> datetime | None:
    """Fetch user's latest push time from GitHub to check if cache is stale."""
    async with httpx.AsyncClient() as client:
        if token:
            # Use GraphQL to get the latest pushed_at time from user's repos
            query = """
            query {
                viewer {
                    repositories(first: 1, orderBy: {field: PUSHED_AT, direction: DESC}) {
                        nodes { pushedAt }
                    }
                }
            }
            """
            response = await client.post(
                GITHUB_GRAPHQL_URL,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
                json={"query": query},
                timeout=10.0,
            )
            result = response.json()
            repos = result.get("data", {}).get("viewer", {}).get("repositories", {}).get("nodes", [])
            if repos and repos[0].get("pushedAt"):
                return datetime.fromisoformat(repos[0]["pushedAt"].replace("Z", "+00:00")).replace(tzinfo=None)
        else:
            # Use REST API for public events
            response = await client.get(
                f"https://api.github.com/users/{username}/events/public?per_page=1",
                timeout=10.0,
            )
            if response.status_code == 200:
                events = response.json()
                if events:
                    return datetime.fromisoformat(events[0]["created_at"].replace("Z", "+00:00")).replace(tzinfo=None)
    return None


async def fetch_user_contributions(
    username: str,
    start_date: str,
    end_date: str,
    token: str | None = None
) -> dict[str, Any]:
    """Fetch user contributions from GitHub GraphQL API."""
    if not token:
        return await fetch_with_rest_api(username, start_date, end_date)

    return await fetch_with_graphql(username, start_date, end_date, token)


async def fetch_with_graphql(
    username: str,
    start_date: str,
    end_date: str,
    token: str
) -> dict[str, Any]:
    """Fetch contributions using GraphQL API (requires token)."""
    start = datetime.fromisoformat(start_date)
    end = datetime.fromisoformat(end_date)

    query = """
    query($from: DateTime!, $to: DateTime!) {
        viewer {
            login
            avatarUrl
            bio
            company
            location
            followers { totalCount }
            following { totalCount }
            repositories(first: 100, ownerAffiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER], orderBy: {field: PUSHED_AT, direction: DESC}) {
                totalCount
                nodes {
                    name
                    nameWithOwner
                    isPrivate
                    stargazerCount
                    forkCount
                    description
                    url
                    primaryLanguage { name color }
                    languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
                        edges { size node { name color } }
                    }
                }
            }
            contributionsCollection(from: $from, to: $to) {
                totalCommitContributions
                totalPullRequestContributions
                totalPullRequestReviewContributions
                totalIssueContributions
                contributionCalendar {
                    totalContributions
                    weeks {
                        contributionDays { date contributionCount }
                    }
                }
                commitContributionsByRepository(maxRepositories: 100) {
                    repository {
                        name
                        nameWithOwner
                        isPrivate
                        stargazerCount
                        forkCount
                        description
                        url
                        primaryLanguage { name color }
                        owner { login __typename }
                    }
                    contributions { totalCount }
                }
            }
            organizations(first: 100) {
                nodes { login avatarUrl }
            }
        }
    }
    """

    async with httpx.AsyncClient() as client:
        response = await client.post(
            GITHUB_GRAPHQL_URL,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            json={
                "query": query,
                "variables": {
                    "from": start.isoformat() + "Z",
                    "to": end.isoformat() + "Z",
                },
            },
            timeout=30.0,
        )

        result = response.json()

        if "errors" in result:
            raise Exception(result["errors"][0]["message"])

        viewer = result.get("data", {}).get("viewer", {})
        collection = viewer.get("contributionsCollection", {})
        calendar = collection.get("contributionCalendar", {})
        repos_data = viewer.get("repositories", {})
        all_repos = repos_data.get("nodes", []) or []

        # Count public/private repos
        public_repos = [r for r in all_repos if not r.get("isPrivate")]
        private_repos = [r for r in all_repos if r.get("isPrivate")]

        # Process daily contributions
        daily_contributions = []
        for week in calendar.get("weeks", []):
            for day in week.get("contributionDays", []):
                daily_contributions.append({
                    "date": day["date"],
                    "count": day["contributionCount"],
                })

        # Process repository contributions
        repo_contributions = []
        for item in collection.get("commitContributionsByRepository", []):
            repo = item.get("repository", {})
            repo_contributions.append({
                "repo": repo.get("name"),
                "fullName": repo.get("nameWithOwner"),
                "count": item.get("contributions", {}).get("totalCount", 0),
                "isPrivate": repo.get("isPrivate", False),
                "stars": repo.get("stargazerCount", 0),
                "forks": repo.get("forkCount", 0),
                "language": repo.get("primaryLanguage", {}).get("name") if repo.get("primaryLanguage") else None,
                "description": repo.get("description"),
                "url": repo.get("url"),
            })

        # Process language stats
        lang_map: dict[str, dict] = {}
        for repo in all_repos:
            for edge in (repo.get("languages", {}).get("edges", []) or []):
                lang_name = edge["node"]["name"]
                if lang_name not in lang_map:
                    lang_map[lang_name] = {
                        "name": lang_name,
                        "color": edge["node"].get("color", "#8b949e"),
                        "size": 0,
                        "repoCount": 0,
                    }
                lang_map[lang_name]["size"] += edge["size"]
                lang_map[lang_name]["repoCount"] += 1

        total_size = sum(l["size"] for l in lang_map.values()) or 1
        language_stats = sorted(
            [
                {**l, "percentage": (l["size"] / total_size) * 100}
                for l in lang_map.values()
            ],
            key=lambda x: x["size"],
            reverse=True,
        )

        # Process organizations
        organizations = [
            {"login": org["login"], "avatarUrl": org["avatarUrl"]}
            for org in (viewer.get("organizations", {}).get("nodes", []) or [])
        ]

        return {
            "username": viewer.get("login"),
            "avatarUrl": viewer.get("avatarUrl"),
            "bio": viewer.get("bio"),
            "company": viewer.get("company"),
            "location": viewer.get("location"),
            "followers": viewer.get("followers", {}).get("totalCount", 0),
            "following": viewer.get("following", {}).get("totalCount", 0),
            "publicRepos": len(public_repos),
            "privateRepos": len(private_repos),
            "totalRepos": repos_data.get("totalCount", 0),
            "totalContributions": calendar.get("totalContributions", 0),
            "totalCommits": collection.get("totalCommitContributions", 0),
            "pullRequests": collection.get("totalPullRequestContributions", 0),
            "pullRequestReviews": collection.get("totalPullRequestReviewContributions", 0),
            "issues": collection.get("totalIssueContributions", 0),
            "dailyContributions": daily_contributions,
            "repositoryContributions": sorted(repo_contributions, key=lambda x: x["count"], reverse=True),
            "languageStats": language_stats,
            "organizations": organizations,
        }


async def fetch_with_rest_api(
    username: str,
    start_date: str,
    end_date: str,
) -> dict[str, Any]:
    """Fetch contributions using REST API (public only)."""
    async with httpx.AsyncClient() as client:
        # 1. Fetch User Profile
        profile_response = await client.get(
            f"https://api.github.com/users/{username}",
            timeout=10.0,
        )
        if profile_response.status_code == 404:
            raise Exception(f"User '{username}' not found")
        
        profile = profile_response.json()
        
        # 2. Fetch User Events (for contributions)
        events_response = await client.get(
            f"https://api.github.com/users/{username}/events/public?per_page=100",
            timeout=30.0,
        )

        events = events_response.json() if events_response.status_code == 200 else []
        start = datetime.fromisoformat(start_date)
        end = datetime.fromisoformat(end_date + "T23:59:59")

        # Filter and aggregate push events
        daily_map: dict[str, int] = {}
        
        # We need to track repos encountered in events to merge with public repos list?
        # Actually, events give us "activity", repos give us "portfolio".
        
        for event in events:
            if event.get("type") != "PushEvent":
                continue
            event_date = datetime.fromisoformat(event["created_at"].replace("Z", "+00:00"))
            if not (start <= event_date.replace(tzinfo=None) <= end):
                continue

            date_str = event["created_at"][:10]
            commit_count = event.get("payload", {}).get("size", 0)

            daily_map[date_str] = daily_map.get(date_str, 0) + commit_count

        daily_contributions = [{"date": d, "count": c} for d, c in sorted(daily_map.items())]
        total_commits = sum(daily_map.values())
        
        # 3. Fetch Public Repositories (Top 100 by pushed_at)
        repos_response = await client.get(
            f"https://api.github.com/users/{username}/repos?sort=pushed&per_page=100",
            timeout=30.0,
        )
        public_repos_list = repos_response.json() if repos_response.status_code == 200 else []
        
        # Process repositories
        repo_contributions = []
        lang_map: dict[str, dict] = {}
        
        for repo in public_repos_list:
            # We don't have exact contribution count per repo from REST easily without heavy API usage.
            # We can use 'size' or just list them as "Top Repos" with 0 contributions or stars?
            # Let's map stars as a proxy for "importance" or just return them.
            # The UI highlights "contributions", but for public data fallback, showing the repos is better than nothing.
            # We will set 'count' to 0 or 1 to ensure they appear? 
            # Or better, we match the GraphQL structure.
            
            repo_contributions.append({
                "repo": repo.get("name"),
                "fullName": repo.get("full_name"),
                "count": 0, # Cannot easily get user's commit count per repo via single REST call
                "isPrivate": repo.get("private", False),
                "stars": repo.get("stargazers_count", 0),
                "forks": repo.get("forks_count", 0),
                "language": repo.get("language"),
                "description": repo.get("description"),
                "url": repo.get("html_url"),
                "pushed_at": repo.get("pushed_at"), # For local sorting if needed
            })
            
            # Aggregate languages
            lang = repo.get("language")
            if lang:
                if lang not in lang_map:
                    lang_map[lang] = {
                        "name": lang,
                        "color": "#8b949e", # Default color, no easy way to get real colors without map
                        "size": 0,
                        "repoCount": 0,
                    }
                # Use approximate size or repo count
                lang_map[lang]["size"] += repo.get("size", 0)
                lang_map[lang]["repoCount"] += 1
                
        # Sort repos by stars (or push time?) - Graphql uses pushed_at then count.
        # Let's sort by stars for "portfolio" feel in fallback.
        repo_contributions.sort(key=lambda x: x["stars"], reverse=True)
        
        # Calc language stats
        total_size = sum(l["size"] for l in lang_map.values()) or 1
        language_stats = sorted(
            [
                {**l, "percentage": (l["size"] / total_size) * 100}
                for l in lang_map.values()
            ],
            key=lambda x: x["size"],
            reverse=True,
        )

        return {
            "username": profile.get("login"),
            "avatarUrl": profile.get("avatar_url"),
            "bio": profile.get("bio"),
            "company": profile.get("company"),
            "location": profile.get("location"),
            "followers": profile.get("followers", 0),
            "following": profile.get("following", 0),
            "publicRepos": profile.get("public_repos", 0),
            "privateRepos": 0, # Unknown
            "totalRepos": profile.get("public_repos", 0),
            "totalContributions": total_commits, # Approximate based on recent events
            "totalCommits": total_commits,
            "pullRequests": 0, # Hard to calc from events easily
            "pullRequestReviews": 0,
            "issues": 0,
            "dailyContributions": daily_contributions,
            "repositoryContributions": repo_contributions, # Top public repos
            "languageStats": language_stats,
            "organizations": [], # Requires another call, skip for now
        }
