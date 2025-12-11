import { useEffect, useState, useMemo, useRef } from 'react'
import { useParams, useLocation } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { getYearbookStats, type YearbookStats, API_BASE } from '../services/api'
import VisitorMap from '../components/VisitorMap'

export default function YearbookPage() {
  const { username, year: yearParam, start, end } = useParams<{ username: string; year?: string; start?: string; end?: string }>()
  const location = useLocation()
  const [data, setData] = useState<YearbookStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  // Helper to resolve period keywords
  let resolvedStart = start
  let resolvedEnd = end
  let resolvedYear = yearParam ? parseInt(yearParam) : new Date().getFullYear()
  let explicitTitle = new URLSearchParams(location.search).get('title')

  if (yearParam && ['pastyear', 'pastmonth', 'pastweek'].includes(yearParam.toLowerCase())) {
    const today = new Date()
    const d = new Date()
    if (yearParam === 'pastyear') d.setDate(d.getDate() - 365)
    else if (yearParam === 'pastmonth') d.setDate(d.getDate() - 30)
    else if (yearParam === 'pastweek') d.setDate(d.getDate() - 7)

    resolvedStart = d.toISOString().split('T')[0]
    resolvedEnd = today.toISOString().split('T')[0]
    // If no title provided, use the friendly param name
    if (!explicitTitle) {
      explicitTitle = yearParam.replace('past', 'Past ').replace(/^\w/, c => c.toUpperCase())
    }
    // Set year to current year for fallback logic if needed, or 0 to indicate custom
    resolvedYear = today.getFullYear()
  }

  const year = resolvedStart ? parseInt(resolvedStart.slice(0, 4)) : resolvedYear
  const title = explicitTitle // use the local variable
  const isScreenshot = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return params.get('screenshot') === '1'
  }, [location.search])

  const embed = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return params.get('embed') === '1'
  }, [location.search])

  const currentHash = location.hash || '#overview'
  const showOverview = currentHash === '#overview'
  const showMap = currentHash === '#viewmapi'

  useEffect(() => {
    if (!username || !year) return
    // Use backend API with caching - no need for token on frontend
    // Backend will use stored token if available
    getYearbookStats(username, year, undefined, resolvedStart, resolvedEnd)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [username, year, resolvedStart, resolvedEnd])

  const stats = useMemo(() => {
    if (!data) return null
    const repos = data.repositoryContributions || []
    const timeline = data.dailyContributions || []
    const total = data.totalContributions || data.totalCommits

    // Weekly activity
    const weekMap = new Map<number, number>()
    const oneWeekMs = 604800000
    const startDateRef = resolvedStart ? new Date(resolvedStart) : new Date(`${year}-01-01`)
    const endDateRef = resolvedEnd ? new Date(resolvedEnd) : new Date(`${year}-12-31`)
    const isCustom = !!(resolvedStart && resolvedEnd && !(resolvedStart.endsWith('-01-01') && resolvedEnd.endsWith('-12-31')))
    const totalDays = Math.max(1, Math.floor((endDateRef.getTime() - startDateRef.getTime()) / 86400000) + 1)
    const weeksCount = isCustom ? Math.max(1, Math.ceil(totalDays / 7)) : 52

    timeline.forEach(d => {
      const date = new Date(d.date)
      const diffTime = endDateRef.getTime() - date.getTime()
      const weeksAgo = Math.floor(diffTime / oneWeekMs)
      const weekIndex = (weeksCount - 1) - weeksAgo
      if (weekIndex >= 0 && weekIndex < weeksCount) {
        weekMap.set(weekIndex, (weekMap.get(weekIndex) || 0) + d.count)
      }
    })

    const weeks = Array(weeksCount).fill(0)
    weekMap.forEach((count, idx) => { weeks[idx] = count })
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
      publicRepoCount: data.publicRepoCount,
      privateRepoCount: data.privateRepoCount,
      totalRepoCount: data.totalRepoCount,
      stars: repos.reduce((s, r) => s + (r.stars || 0), 0),
      forks: repos.reduce((s, r) => s + (r.forks || 0), 0),
      longest: data.longestStreak,
      current: data.currentStreak,
      activeDays: data.activeDays,
      weeks,
      maxW,
      weeksCount,
      dayOfWeek,
      maxDay,
      maxDayEntry,
      avgPerDay: (total / Math.max(data.activeDays, 1)).toFixed(1),
      bio: data.bio,
      company: data.company,
      location: data.location,
      followers: data.followers,
      following: data.following,
      avatarUrl: data.avatarUrl,
      organizations: data.organizations,
      // Full language stats
      languageStats: data.languageStats || [],
      // Contributed repos
      contributedRepos: repos,
      privateRepos,
      publicRepos,
      // Cache info
      cached: data.cached,
    }
  }, [data])

  const yearStr = resolvedStart?.slice(0, 4) || String(resolvedYear)
  const isCustomRange = resolvedStart && resolvedEnd && !(resolvedStart.endsWith('-01-01') && resolvedEnd.endsWith('-12-31'))
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  const copyMarkdown = () => {
    navigator.clipboard.writeText(`[![${username}'s ${yearStr} GitHub Stats](${API_BASE}/card/${username}/${start}/${end})](${window.location.href})`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const downloadPng = async () => {
    if (!cardRef.current) return
    const html2canvas = (await import('html2canvas')).default
    const canvas = await html2canvas(cardRef.current, { backgroundColor: '#0d1117', scale: 2 })
    const a = document.createElement('a')
    a.download = `${username}-${yearStr}-stats.png`
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
    </div>
  )

  // Split languages for display
  const topLangs = stats.languageStats.slice(0, 8)
  const otherLangs = stats.languageStats.slice(8)
  const otherSize = otherLangs.reduce((s, l) => s + l.size, 0)
  const totalSize = stats.languageStats.reduce((s, l) => s + l.size, 0) || 1

  const displayRepos = isScreenshot ? stats.contributedRepos : stats.contributedRepos.slice(0, 6)
  const displayPrivateRepos = isScreenshot ? stats.privateRepos : stats.privateRepos.slice(0, 4)

  return (
    <div className="min-h-screen bg-[#0d1117] p-4 md:p-6 flex flex-col items-center">
      <div id="screenshot-target" className="w-full max-w-5xl">
        {/* Actions */}
        {!embed && !isScreenshot && (
          <div className="mb-3 flex justify-end items-center">
            <div className="flex gap-2">
              <button onClick={copyMarkdown} className="px-3 py-1 text-xs bg-[#21262d] border border-[#30363d] rounded text-[#c9d1d9] hover:border-[#8b949e]">
                {copied ? 'Copied!' : 'Copy MD'}
              </button>
              <button onClick={downloadPng} className="px-3 py-1 text-xs bg-[#238636] rounded text-white hover:bg-[#2ea043]">
                PNG
              </button>
            </div>
          </div>
        )}

        {/* Main Card */}
        {showOverview && (
          <div id="yearbook-card" ref={cardRef} className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg overflow-hidden mb-6">
            {/* Header with profile */}
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
                <Section title={isCustomRange ? `Activity (${stats.weeksCount} weeks)` : '52-Week Activity'}>
                  <div className="flex gap-px h-10 rounded overflow-hidden bg-[#161b22]">
                    {stats.weeks.map((w, i) => (
                      <div
                        key={i}
                        className="flex-1"
                        style={{ backgroundColor: w ? `rgba(63,185,80,${0.2 + (w / stats.maxW) * 0.8})` : 'transparent' }}
                        title={`Week ${i + 1} : ${w}`}
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
                    {displayRepos.map((repo) => (
                      <RepoCard key={repo.fullName || repo.repo} repo={repo} />
                    ))}
                  </div>
                </Section>

                {displayPrivateRepos.length > 0 && (
                  <Section title={`Private Repos (${stats.privateRepos.length})`}>
                    <div className="space-y-1.5">
                      {displayPrivateRepos.map(repo => (
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
            </div>

            {/* Footer */}
            <div className="px-4 py-2 bg-[#161b22] border-t border-[#21262d] flex justify-between text-[10px] text-[#484f58]">
              <span>@silan-github-yearbook</span>
              <span>Generated {new Date().toLocaleDateString()}</span>
            </div>
          </div>
        )}

        {/* Embed Code */}
        {!embed && !isScreenshot && (
          <div className="mb-6">
            <div className="text-xs text-[#8b949e] mb-1">Embed in README:</div>
            <code className="block p-2 bg-[#161b22] border border-[#30363d] rounded text-[10px] text-[#8b949e] overflow-x-auto font-mono">
              {`[![${username}'s ${yearStr} GitHub Stats](${API_BASE}/card/${username}/${start}/${end})](${window.location.href})`}
            </code>
          </div>
        )}

        {/* Visitor Map */}
        {(!embed || isScreenshot) && showMap && (
          <div className="mb-6">
            <VisitorMap />
          </div>
        )}
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
