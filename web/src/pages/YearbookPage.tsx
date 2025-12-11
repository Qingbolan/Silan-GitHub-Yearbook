import { useRef, useState } from 'react'
import { API_BASE } from '../services/api'
import VisitorMap from '../components/VisitorMap'
import { useYearbookLogic } from '../hooks/useYearbookLogic'

// Components
import { Header } from '../components/yearbook/Header'
import { StatsGrid } from '../components/yearbook/StatsGrid'
import { ActivitySection } from '../components/yearbook/ActivitySection'
import { TechStackSection } from '../components/yearbook/TechStackSection'
import { RepoSection } from '../components/yearbook/RepoSection'
import { Footer } from '../components/yearbook/Footer'
import { EmbedCode } from '../components/yearbook/EmbedCode'

export default function YearbookPage() {
  const {
    username,
    yearStr,
    start,
    end,
    title,
    isCustomRange,
    isScreenshot,
    embed,
    stats,
    loading,
    error,
    resolvedStart,
    resolvedEnd
  } = useYearbookLogic()

  const cardRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)

  // Derive showOverview/showMap from hash/screenshot state
  const currentHash = location.hash || '#overview'
  const isShowOverview = currentHash === '#overview' || isScreenshot
  const isShowMap = currentHash === '#viewmapi' || isScreenshot

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
        {isShowOverview && (
          <div id="yearbook-card" ref={cardRef} className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg overflow-hidden mb-6">
            <Header
              stats={stats}
              title={title}
              username={username}
              yearStr={yearStr}
              isCustomRange={isCustomRange}
              resolvedStart={resolvedStart}
              resolvedEnd={resolvedEnd}
            />

            <StatsGrid stats={stats} />

            <div className="grid lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-[#21262d]">
              <ActivitySection stats={stats} isCustomRange={isCustomRange} />
              <TechStackSection stats={stats} />
              <RepoSection stats={stats} isScreenshot={isScreenshot} />
            </div>

            <Footer />
          </div>
        )}

        {/* Embed Code */}
        {!embed && !isScreenshot && (
          <EmbedCode username={username} yearStr={yearStr} start={start} end={end} />
        )}

        {/* Visitor Map */}
        {(!embed || isScreenshot) && isShowMap && (
          <div className="mb-6">
            <VisitorMap />
          </div>
        )}
      </div>
    </div >
  )
}
