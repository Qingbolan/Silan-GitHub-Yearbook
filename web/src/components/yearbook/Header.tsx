
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface HeaderProps {
    stats: any
    title: string | null
    username: string | undefined
    yearStr: string
    isCustomRange: boolean
    resolvedStart: string | undefined
    resolvedEnd: string | undefined
}

export function Header({ stats, title, username, yearStr, isCustomRange, resolvedStart, resolvedEnd }: HeaderProps) {
    return (
        <div className="p-4 border-b border-[#21262d] flex items-center gap-4">
            {stats.avatarUrl && (
                <img src={stats.avatarUrl} alt={username} className="w-14 h-14 rounded-full border-2 border-[#30363d]" />
            )}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-lg font-bold text-white">{username}</span>
                    <span className="text-xs text-[#8b949e] bg-[#21262d] px-2 py-0.5 rounded">
                        {title || (isCustomRange ? `${resolvedStart} ~ ${resolvedEnd}` : yearStr)}
                    </span>
                    {stats.organizations.length > 0 && (
                        <div className="flex -space-x-2">
                            {stats.organizations.map((org: any) => (
                                <img
                                    key={org.login}
                                    src={org.avatarUrl}
                                    alt={org.login}
                                    title={org.login}
                                    className="w-6 h-6 rounded-full border-2 border-[#0d1117]"
                                />
                            ))}
                        </div>
                    )}
                </div>
                {stats.bio && (
                    <div className="text-xs text-[#8b949e] mt-0.5 [&_a]:text-[#58a6ff] [&_a]:hover:underline [&_p]:my-0.5">
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                                a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" />
                            }}
                        >
                            {stats.bio}
                        </ReactMarkdown>
                    </div>
                )}
                <div className="flex gap-3 mt-1 text-xs text-[#8b949e]">
                    {stats.company && <span>{stats.company}</span>}
                    {stats.location && <span>{stats.location}</span>}
                    {stats.followers > 0 && <span>{stats.followers.toLocaleString()} followers</span>}
                </div>
            </div>
        </div>
    )
}
