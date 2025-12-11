
import { Section } from './Section'
import { RepoCard } from './RepoCard'

interface RepoSectionProps {
    stats: any
    isScreenshot: boolean
}

export function RepoSection({ stats, isScreenshot }: RepoSectionProps) {
    const displayRepos = stats.contributedRepos.slice(0, 6)
    const displayPrivateRepos = isScreenshot ? stats.privateRepos : stats.privateRepos.slice(0, 4)

    return (
        <div className="p-4 space-y-4">
            <Section title={`Top Repositories (${stats.repoCount} contributed)`}>
                <div className="space-y-2 max-h-full overflow-y-auto">
                    {displayRepos.map((repo: any) => (
                        <RepoCard key={repo.fullName || repo.repo} repo={repo} />
                    ))}
                </div>
            </Section>

            {displayPrivateRepos.length > 0 && (
                <Section title={`Private Repos (${stats.privateRepos.length})`}>
                    <div className="space-y-1.5">
                        {displayPrivateRepos.map((repo: any) => (
                            <div key={repo.fullName || repo.repo} className="flex items-center gap-2 text-xs p-1.5 bg-[#161b22] rounded">
                                <span className="text-[#f0883e]">Private</span>
                                <span className="text-[#c9d1d9] truncate flex-1">{repo.repo}</span>
                                <span className="text-[#3fb950]">{repo.count} commits</span>
                            </div>
                        ))}
                        {!isScreenshot && stats.privateRepos.length > 4 && (
                            <p className="text-[10px] text-[#484f58]">+{stats.privateRepos.length - 4} more private repos</p>
                        )}
                    </div>
                </Section>
            )}
        </div>
    )
}
