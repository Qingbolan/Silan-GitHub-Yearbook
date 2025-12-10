import { useEffect, useState, useMemo, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { fetchUserContributions, type ContributionData } from '../services/github'
import VisitorMap from '../components/VisitorMap'

export default function YearbookPage() {
  const { username, start, end } = useParams<{ username: string; start: string; end: string }>()
  const [data, setData] = useState<ContributionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!username || !start || !end) return
    // Get token from env (build time) or localStorage (fallback for local dev)
    const token = import.meta.env.VITE_GITHUB_TOKEN || localStorage.getItem('github_token') || undefined
    fetchUserContributions(username, start, end, token)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [username, start, end])

  const stats = useMemo(() => {
    if (!data) return null
    const repos = data.repositoryContributions
    const timeline = data.dailyContributions
    const total = data.totalContributions || data.totalCommits

    // Streaks
    const active = timeline.filter(d => d.count > 0).sort((a, b) => a.date.localeCompare(b.date))
    let longest = 0, streak = 0
    let prev: Date | null = null
    active.forEach(d => {
      const cur = new Date(d.date)
      if (prev && (cur.getTime() - prev.getTime()) / 86400000 === 1) streak++
      else { longest = Math.max(longest, streak); streak = 1 }
      prev = cur
    })
    longest = Math.max(longest, streak)

    // Current streak
    let current = 0
    const dates = new Set(active.map(d => d.date))
    const endD = new Date(end!)
    for (let i = 0; i < 365; i++) {
      const d = new Date(endD); d.setDate(d.getDate() - i)
      if (dates.has(d.toISOString().split('T')[0])) current++
      else if (i > 0) break
    }

    // Weekly activity (52 weeks)
    const weekMap = new Map<number, number>()
    timeline.forEach(d => {
      const w = Math.floor(new Date(d.date).getTime() / 604800000)
      weekMap.set(w, (weekMap.get(w) || 0) + d.count)
    })
    const weeks = Array.from(weekMap.entries()).sort((a, b) => a[0] - b[0]).slice(-52).map(([, c]) => c)
    const maxW = Math.max(...weeks, 1)

    // Day of week distribution
    const dayOfWeek = [0, 0, 0, 0, 0, 0, 0]
    timeline.forEach(d => {
      const day = new Date(d.date).getDay()
      dayOfWeek[day] += d.count
    })
    const maxDay = Math.max(...dayOfWeek, 1)

    // Most productive day
    const maxDayEntry = timeline.reduce((max, d) => d.count > (max?.count || 0) ? d : max, timeline[0])

    // Private vs public repos
    const privateRepos = repos.filter(r => r.isPrivate)
    const publicRepos = repos.filter(r => !r.isPrivate && !r.repo.includes('Private'))

    return {
      total,
      commits: data.totalCommits,
      prs: data.pullRequests,
      reviews: data.pullRequestReviews,
      issues: data.issues,
      repoCount: repos.length,
      publicRepoCount: data.publicRepos,
      privateRepoCount: data.privateRepos,
      totalRepoCount: data.totalRepos,
      stars: repos.reduce((s, r) => s + (r.stars || 0), 0),
      forks: repos.reduce((s, r) => s + (r.forks || 0), 0),
      longest,
      current,
      activeDays: active.length,
      weeks,
      maxW,
      dayOfWeek,
      maxDay,
      maxDayEntry,
      avgPerDay: (total / Math.max(active.length, 1)).toFixed(1),
      bio: data.bio,
      company: data.company,
      location: data.location,
      followers: data.followers,
      following: data.following,
      avatarUrl: data.avatarUrl,
      organizations: data.organizations,
      // Full language stats
      languageStats: data.languageStats,
      // All repos
      allRepos: data.allRepos,
      // Contributed repos
      contributedRepos: repos,
      privateRepos,
      publicRepos,
      missingScopes: data.missingScopes,
      tokenType: data.tokenType,
      linesAdded: data.linesAdded,
      linesDeleted: data.linesDeleted,
    }
  }, [data, end])

  const year = start?.slice(0, 4)
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  const copyMarkdown = () => {
    navigator.clipboard.writeText(`[![${username}'s ${year} GitHub Stats](${location.href})](${location.href})`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const downloadPng = async () => {
    if (!cardRef.current) return
    const html2canvas = (await import('html2canvas')).default
    const canvas = await html2canvas(cardRef.current, { backgroundColor: '#0d1117', scale: 2 })
    const a = document.createElement('a')
    a.download = `${username}-${year}-stats.png`
    a.href = canvas.toDataURL()
    a.click()
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
      <div className="text-[#8b949e] flex items-center gap-2">
        <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" /></svg>
        Loading...
      </div>
    </div>
  )

  if (error || !stats) return (
    <div className="min-h-screen bg-[#0d1117] flex flex-col items-center justify-center gap-4">
      <p className="text-[#f85149]">{error || 'No data'}</p>
      <Link to="/" className="text-[#58a6ff] text-sm hover:underline">Back</Link>
    </div>
  )

  // Split languages for display
  const topLangs = stats.languageStats.slice(0, 8)
  const otherLangs = stats.languageStats.slice(8)
  const otherSize = otherLangs.reduce((s, l) => s + l.size, 0)
  const totalSize = stats.languageStats.reduce((s, l) => s + l.size, 0) || 1

  return (
    <div className="min-h-screen bg-[#0d1117] p-4 md:p-6">
      {/* Actions */}
      <div className="max-w-5xl mx-auto mb-3 flex justify-between items-center">
        <Link to="/" className="text-[#8b949e] text-sm hover:text-white">Back</Link>
        <div className="flex gap-2">
          <button onClick={copyMarkdown} className="px-3 py-1 text-xs bg-[#21262d] border border-[#30363d] rounded text-[#c9d1d9] hover:border-[#8b949e]">
            {copied ? 'Copied!' : 'Copy MD'}
          </button>
          <button onClick={downloadPng} className="px-3 py-1 text-xs bg-[#238636] rounded text-white hover:bg-[#2ea043]">
            PNG
          </button>
        </div>
      </div>

      {/* Missing Scopes Warning */}
      {
        stats.missingScopes && stats.missingScopes.length > 0 && (
          <div className="max-w-5xl mx-auto mb-4 p-3 bg-yellow-900/30 border border-yellow-700/50 rounded-md flex items-center gap-3 text-yellow-200 text-sm">
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <span className="font-bold">Missing Permissions:</span> Your token is missing the following scopes: <code className="bg-yellow-900/50 px-1 rounded">{stats.missingScopes.join(', ')}</code>.
              Some private data (organizations, repos) may be missing. Please update your token permissions.
            </div>
          </div>
        )
      }

      {/* Fine-grained Token Warning */}
      {stats.tokenType === 'fine-grained' && (
        <div className="max-w-5xl mx-auto mb-4 p-3 bg-blue-900/30 border border-blue-700/50 rounded-md flex items-center gap-3 text-blue-200 text-sm">
          <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <span className="font-bold">Fine-grained Token Detected:</span> You are using a fine-grained token.
            Ensure you have selected <strong>"All repositories"</strong> or explicitly selected the organizations you want to see.
            Also verify "Organization permissions" &gt; "Members" is set to "Read-only".
          </div>
        </div>
      )}

      {/* Main Card */}
      <div ref={cardRef} className="max-w-5xl mx-auto bg-[#0d1117] border border-[#30363d] rounded-lg overflow-hidden">
        {/* Header with profile */}
        <div className="p-4 border-b border-[#21262d] flex items-center gap-4">
          {stats.avatarUrl && (
            <img src={stats.avatarUrl} alt={username} className="w-14 h-14 rounded-full border-2 border-[#30363d]" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-lg font-bold text-white">{username}</span>
              <span className="text-xs text-[#8b949e] bg-[#21262d] px-2 py-0.5 rounded">{year}</span>
              {stats.organizations.length > 0 && (
                <div className="flex -space-x-2">
                  {stats.organizations.map(org => (
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
            {stats.bio && <p className="text-xs text-[#8b949e] truncate mt-0.5">{stats.bio}</p>}
            <div className="flex gap-3 mt-1 text-xs text-[#8b949e]">
              {stats.company && <span>{stats.company}</span>}
              {stats.location && <span>{stats.location}</span>}
              {stats.followers > 0 && <span>{stats.followers.toLocaleString()} followers</span>}
            </div>
          </div>
        </div>

        {/* Core Stats Row */}
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

        {/* Activity + Languages + Stats */}
        <div className="grid lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-[#21262d]">
          {/* Left: Activity Graph + Day distribution */}
          <div className="p-4 space-y-4">
            <Section title="52-Week Activity">
              <div className="flex gap-px h-10 rounded overflow-hidden bg-[#161b22]">
                {stats.weeks.map((w, i) => (
                  <div
                    key={i}
                    className="flex-1"
                    style={{ backgroundColor: w ? `rgba(63,185,80,${0.2 + (w / stats.maxW) * 0.8})` : 'transparent' }}
                    title={`Week ${i + 1}: ${w}`}
                  />
                ))}
              </div>
            </Section>

            <Section title="Day of Week">
              <div className="space-y-1">
                {dayNames.map((day, i) => (
                  <div key={day} className="flex items-center gap-2 text-xs">
                    <span className="w-7 text-[#8b949e]">{day}</span>
                    <div className="flex-1 h-3 bg-[#161b22] rounded overflow-hidden">
                      <div className="h-full bg-[#238636]" style={{ width: `${(stats.dayOfWeek[i] / stats.maxDay) * 100}%` }} />
                    </div>
                    <span className="w-10 text-right text-[#8b949e]">{stats.dayOfWeek[i]}</span>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Highlights">
              <div className="space-y-1 text-xs">
                <Row label="Current Streak" value={`${stats.current} days`} />
                <Row label="Avg per Day" value={`${stats.avgPerDay}`} />
                {stats.maxDayEntry && <Row label="Best Day" value={`${stats.maxDayEntry.date} (${stats.maxDayEntry.count})`} />}
                {stats.organizations.length > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-[#8b949e]">Organizations</span>
                    <div className="flex -space-x-1">
                      {stats.organizations.map(org => (
                        <img
                          key={org.login}
                          src={org.avatarUrl}
                          alt={org.login}
                          title={org.login}
                          className="w-4 h-4 rounded-full border border-[#161b22]"
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Section>
          </div>

          {/* Middle: Full Tech Stack */}
          <div className="p-4 space-y-4">
            <Section title={`Tech Stack (${stats.languageStats.length} Languages)`}>
              {/* Stacked bar */}
              <div className="h-4 rounded-full overflow-hidden flex mb-3">
                {topLangs.map(lang => (
                  <div
                    key={lang.name}
                    style={{ width: `${lang.percentage}%`, backgroundColor: lang.color }}
                    title={`${lang.name}: ${lang.percentage.toFixed(1)}%`}
                  />
                ))}
                {otherSize > 0 && (
                  <div
                    style={{ width: `${(otherSize / totalSize) * 100}%`, backgroundColor: '#484f58' }}
                    title={`Other: ${((otherSize / totalSize) * 100).toFixed(1)}%`}
                  />
                )}
              </div>

              {/* Full language list */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {stats.languageStats.slice(0, 12).map(lang => (
                  <div key={lang.name} className="flex items-center gap-1.5 text-xs">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: lang.color }} />
                    <span className="text-[#c9d1d9] truncate flex-1">{lang.name}</span>
                    <span className="text-[#58a6ff]">{lang.percentage.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
              {stats.languageStats.length > 12 && (
                <p className="text-[10px] text-[#484f58] mt-2">+{stats.languageStats.length - 12} more languages</p>
              )}
            </Section>

            {/* Language Usage Section */}
            <Section title="Language Usage (by Repos)">
              <div className="space-y-2">
                {stats.languageStats.slice(0, 6).map((lang) => (
                  <div key={lang.name} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-[#c9d1d9]">{lang.name}</span>
                      <span className="text-[#8b949e]">{lang.repoCount} repos</span>
                    </div>
                    <div className="h-2 bg-[#161b22] rounded overflow-hidden">
                      <div
                        className="h-full rounded"
                        style={{
                          width: `${lang.percentage}%`,
                          backgroundColor: lang.color || '#8b949e'
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          </div>

          {/* Right: Repositories */}
          <div className="p-4 space-y-4">
            <Section title={`Top Repositories (${stats.repoCount} contributed)`}>
              <div className="space-y-2 max-h-full overflow-y-auto">
                {stats.contributedRepos.slice(0, 6).map((repo) => (
                  <RepoCard key={repo.fullName || repo.repo} repo={repo} />
                ))}
              </div>
            </Section>

            {stats.privateRepos.length > 0 && (
              <Section title={`Private Repos (${stats.privateRepos.length})`}>
                <div className="space-y-1.5">
                  {stats.privateRepos.slice(0, 4).map(repo => (
                    <div key={repo.fullName || repo.repo} className="flex items-center gap-2 text-xs p-1.5 bg-[#161b22] rounded">
                      <span className="text-[#f0883e]">Private</span>
                      <span className="text-[#c9d1d9] truncate flex-1">{repo.repo}</span>
                      <span className="text-[#3fb950]">{repo.count} commits</span>
                    </div>
                  ))}
                  {stats.privateRepos.length > 4 && (
                    <p className="text-[10px] text-[#484f58]">+{stats.privateRepos.length - 4} more private repos</p>
                  )}
                </div>
              </Section>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2 bg-[#161b22] border-t border-[#21262d] flex justify-between text-[10px] text-[#484f58]">
          <span>github-yearbook</span>
          <span>Generated {new Date().toLocaleDateString()}</span>
        </div>
      </div>

      {/* Embed Code */}
      <div className="max-w-5xl mx-auto mt-4">
        <div className="text-xs text-[#8b949e] mb-1">Embed in README:</div>
        <code className="block p-2 bg-[#161b22] border border-[#30363d] rounded text-[10px] text-[#8b949e] overflow-x-auto font-mono">
          {`[![${username}'s ${year} GitHub Stats](${location.origin}/api/card/${username}/${start}/${end})](${location.href})`}
        </code>
      </div>

      {/* Visitor Map */}
      <div className="max-w-5xl mx-auto mt-6">
        <VisitorMap />
      </div>
    </div >
  )
}

function StatCell({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div className="p-2 border-r border-b border-[#21262d] last:border-r-0">
      <div className="text-base font-bold" style={{ color }}>{value}</div>
      <div className="text-[9px] text-[#8b949e] uppercase tracking-wide">{sub || label}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] text-[#8b949e] uppercase tracking-wider mb-2 font-medium">{title}</div>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-[#8b949e]">{label}</span>
      <span className="text-[#c9d1d9] truncate ml-2">{value}</span>
    </div>
  )
}

function RepoCard({ repo }: { repo: { repo: string; fullName?: string; url?: string; language?: string; stars?: number; count: number; description?: string; isPrivate: boolean } }) {
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
