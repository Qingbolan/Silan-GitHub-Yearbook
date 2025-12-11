
import { StatCell } from './StatCell'

interface StatsGridProps {
    stats: any
}

export function StatsGrid({ stats }: StatsGridProps) {
    return (
        <div className="grid grid-cols-4 md:grid-cols-8 border-b border-[#21262d] text-center">
            <StatCell label="Contributions" value={stats.total.toLocaleString()} color="#3fb950" />
            <StatCell label="Commits" value={stats.commits.toLocaleString()} color="#58a6ff" />
            <StatCell label="PRs" value={String(stats.prs)} color="#a371f7" />
            <StatCell label="Reviews" value={String(stats.reviews)} color="#f0883e" />
            <StatCell label="Issues" value={String(stats.issues)} color="#3fb950" />
            <StatCell label="Repos" value={`${stats.publicRepoCount}+${stats.privateRepoCount}`} color="#58a6ff" sub="pub+priv" />
            <StatCell label="Best Streak" value={`${stats.longest}d`} color="#f97316" />
            <StatCell label="Active Days" value={String(stats.activeDays)} color="#3fb950" />
        </div>
    )
}
