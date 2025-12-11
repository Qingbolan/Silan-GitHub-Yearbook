

export function RepoCard({ repo }: { repo: { repo: string; fullName?: string; url?: string; language?: string; stars?: number; count: number; description?: string; isPrivate: boolean } }) {
    const langColors: Record<string, string> = {
        JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5', Java: '#b07219',
        Go: '#00ADD8', Rust: '#dea584', 'C++': '#f34b7d', C: '#555555', Ruby: '#701516',
        PHP: '#4F5D95', Swift: '#F05138', Kotlin: '#A97BFF', Shell: '#89e051', HTML: '#e34c26',
        CSS: '#563d7c', Vue: '#41b883', Dart: '#00B4AB', 'C#': '#178600', Scala: '#c22d40',
    }

    return (
        <a
            href={repo.url || `https://github.com/${repo.fullName}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block p-2 bg-[#161b22] rounded border border-[#21262d] hover:border-[#30363d]"
        >
            <div className="flex items-center gap-2">
                <span className="text-[#58a6ff] text-xs font-medium truncate flex-1">{repo.repo}</span>
                {repo.isPrivate && <span className="text-[9px] text-[#f0883e] bg-[#f0883e20] px-1 rounded">Private</span>}
                {repo.stars !== undefined && repo.stars > 0 && (
                    <span className="text-[#8b949e] text-[10px] flex items-center gap-0.5">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 16 16"><path d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z" /></svg>
                        {repo.stars}
                    </span>
                )}
            </div>
            <div className="flex items-center gap-2 mt-1">
                {repo.language && (
                    <span className="flex items-center gap-1 text-[10px] text-[#8b949e]">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: langColors[repo.language] || '#8b949e' }} />
                        {repo.language}
                    </span>
                )}
                <span className="text-[10px] text-[#3fb950]">{repo.count} commits</span>
            </div>
        </a>
    )
}
