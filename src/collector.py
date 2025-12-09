import os
import pandas as pd
from github import Github
from git import Repo
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)

class DataCollector:
    def __init__(self, config):
        self.config = config
        self.start_date = datetime.strptime(config['start_date'], "%Y-%m-%d").replace(tzinfo=timezone.utc)
        self.end_date = datetime.strptime(config['end_date'], "%Y-%m-%d").replace(tzinfo=timezone.utc)
        self.commits = []

    def collect_all(self):
        self.collect_local()
        self.collect_remote()
        return pd.DataFrame(self.commits)

    def collect_local(self):
        local_repos = self.config.get('local_repos', [])
        for repo_path in local_repos:
            if not os.path.exists(repo_path):
                logger.warning(f"Local repo not found: {repo_path}")
                continue
            
            try:
                repo = Repo(repo_path)
                repo_name = os.path.basename(repo_path)
                logger.info(f"Scanning local repo: {repo_name}")
                
                for commit in repo.iter_commits():
                    commit_date = datetime.fromtimestamp(commit.committed_date, tz=timezone.utc)
                    if self.start_date <= commit_date <= self.end_date:
                        self.commits.append({
                            'repo': repo_name,
                            'hash': commit.hexsha,
                            'date': commit_date,
                            'author': commit.author.name,
                            'message': commit.message.strip(),
                            'files': list(commit.stats.files.keys()),
                            'insertions': commit.stats.total['insertions'],
                            'deletions': commit.stats.total['deletions'],
                            'source': 'local'
                        })
            except Exception as e:
                logger.error(f"Error scanning local repo {repo_path}: {e}")

    def collect_remote(self):
        token = os.getenv(self.config.get('github_token_env'))
        if not token:
            logger.warning("No GitHub token found. Skipping remote collection.")
            return

        g = Github(token)
        try:
            user = g.get_user()
            logger.info(f"Scanning remote repos for user: {user.login}")
            
            # This can be slow, might need optimization or specific repo list
            for repo in user.get_repos():
                # Optimization: Skip if updated_at is before start_date
                if repo.updated_at.replace(tzinfo=timezone.utc) < self.start_date:
                    continue
                
                try:
                    commits = repo.get_commits(since=self.start_date, until=self.end_date, author=user)
                    for commit in commits:
                        # Avoid duplicates if we already scanned this locally
                        # Simple check by hash (though local/remote hashes usually match if synced)
                        # For now, just add and we can dedupe later
                        self.commits.append({
                            'repo': repo.name,
                            'hash': commit.sha,
                            'date': commit.commit.author.date.replace(tzinfo=timezone.utc),
                            'author': commit.commit.author.name,
                            'message': commit.commit.message,
                            'files': [f.filename for f in commit.files], # This requires an extra API call per commit usually, but PyGithub objects might load it lazily. 
                            # Note: commit.files triggers a request. Be careful with rate limits.
                            # For summary, maybe we don't need full file list if it's too slow.
                            # Let's keep it for now but be aware.
                            'insertions': commit.stats.additions,
                            'deletions': commit.stats.deletions,
                            'source': 'remote'
                        })
                except Exception as e:
                    logger.warning(f"Error accessing repo {repo.name}: {e}")
        except Exception as e:
            logger.error(f"GitHub API Error: {e}")

    def deduplicate(self):
        # Convert to DF first then dedupe by hash
        df = pd.DataFrame(self.commits)
        if not df.empty:
            df = df.drop_duplicates(subset=['hash'])
        return df
