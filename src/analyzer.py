import pandas as pd
from collections import Counter
import re
from wordcloud import STOPWORDS

class Analyzer:
    def __init__(self, df):
        self.df = df
        if not self.df.empty:
            self.df['date'] = pd.to_datetime(self.df['date'])

    def timeline_stats(self):
        if self.df.empty:
            return pd.DataFrame()
        
        # Monthly stats
        monthly = self.df.set_index('date').resample('M').size().reset_index(name='count')
        return monthly

    def project_stats(self):
        if self.df.empty:
            return pd.DataFrame()
        
        return self.df.groupby('repo').size().reset_index(name='count').sort_values('count', ascending=False)

    def language_stats(self):
        if self.df.empty:
            return {}
        
        # This is a simplified heuristic based on file extensions
        # In a real scenario, we'd iterate over 'files' list in each commit
        # But 'files' might be a list of strings.
        
        ext_counts = Counter()
        
        # Map common extensions to languages
        ext_map = {
            '.py': 'Python',
            '.go': 'Go',
            '.rs': 'Rust',
            '.js': 'JavaScript',
            '.ts': 'TypeScript',
            '.tsx': 'TypeScript',
            '.jsx': 'JavaScript',
            '.sh': 'Shell',
            '.tex': 'LaTeX',
            '.md': 'Markdown',
            '.cpp': 'C++',
            '.c': 'C',
            '.java': 'Java',
            '.html': 'HTML',
            '.css': 'CSS'
        }

        for files in self.df['files']:
            if not isinstance(files, list):
                continue
            for f in files:
                _, ext = os.path.splitext(f)
                if ext in ext_map:
                    ext_counts[ext_map[ext]] += 1
        
        return dict(ext_counts)

    def message_keywords(self, top_n=50):
        if self.df.empty:
            return {}
        
        text = " ".join(self.df['message'].dropna())
        # Simple tokenization
        words = re.findall(r'\w+', text.lower())
        
        # Filter stopwords
        stopwords = set(STOPWORDS)
        stopwords.update(['merge', 'pull', 'request', 'branch', 'commit', 'fix', 'feat', 'chore', 'update', 'add', 'remove', 'delete'])
        
        filtered_words = [w for w in words if w not in stopwords and len(w) > 2]
        return Counter(filtered_words).most_common(top_n)

    def get_summary_stats(self):
        if self.df.empty:
            return {
                'total_commits': 0,
                'total_repos': 0,
                'top_repo': 'N/A',
                'peak_month': 'N/A'
            }
        
        total_commits = len(self.df)
        total_repos = self.df['repo'].nunique()
        top_repo = self.df['repo'].value_counts().idxmax()
        
        monthly = self.timeline_stats()
        peak_month_row = monthly.loc[monthly['count'].idxmax()]
        peak_month = peak_month_row['date'].strftime('%B %Y')
        
        return {
            'total_commits': total_commits,
            'total_repos': total_repos,
            'top_repo': top_repo,
            'peak_month': peak_month
        }
