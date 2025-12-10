import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const currentYear = new Date().getFullYear()

const PRESETS = [
  { label: String(currentYear), start: `${currentYear}-01-01`, end: new Date().toISOString().split('T')[0] },
  { label: String(currentYear - 1), start: `${currentYear - 1}-01-01`, end: `${currentYear - 1}-12-31` },
  { label: 'All Time', start: '2008-01-01', end: new Date().toISOString().split('T')[0] },
]

export default function LandingPage() {
  const [username, setUsername] = useState('')
  const [start, setStart] = useState(PRESETS[0].start)
  const [end, setEnd] = useState(PRESETS[0].end)
  const [selected, setSelected] = useState(PRESETS[0].label)
  const navigate = useNavigate()

  // Check if token is available (from env or localStorage for dev)
  const hasToken = !!(import.meta.env.VITE_GITHUB_TOKEN || localStorage.getItem('github_token'))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim()) return
    navigate(`/yearbook/${username.trim()}/${start}/${end}`)
  }

  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-6">
          <svg className="w-12 h-12 mx-auto text-white mb-3" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
          </svg>
          <h1 className="text-xl font-semibold text-white">GitHub Yearbook</h1>
          <p className="text-xs text-[#8b949e] mt-1">Generate your GitHub year in review</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-[#161b22] border border-[#30363d] rounded-md p-4 space-y-4">
          <div>
            <label className="text-xs text-[#8b949e] block mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="octocat"
              className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded text-sm text-white placeholder-[#484f58] focus:border-[#58a6ff] focus:outline-none"
            />
          </div>

          <div>
            <label className="text-xs text-[#8b949e] block mb-1">Period</label>
            <div className="flex gap-1">
              {PRESETS.map(p => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => { setStart(p.start); setEnd(p.end); setSelected(p.label) }}
                  className={`flex-1 py-1.5 text-xs rounded transition-colors ${
                    selected === p.label
                      ? 'bg-[#238636] text-white'
                      : 'bg-[#21262d] text-[#8b949e] hover:text-white'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={!username.trim()}
            className="w-full py-2 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 text-white text-sm font-medium rounded transition-colors"
          >
            Generate
          </button>

          {/* Token status indicator */}
          <div className="text-center text-[10px] text-[#484f58]">
            {hasToken ? (
              <span className="text-[#3fb950]">● Token configured (private repos enabled)</span>
            ) : (
              <span>Public repos only</span>
            )}
          </div>
        </form>

        <p className="text-center text-[10px] text-[#484f58] mt-4">
          Like <a href="https://github.com/anuraghazra/github-readme-stats" className="text-[#58a6ff] hover:underline">github-readme-stats</a>, but for yearly summaries
        </p>
      </div>
    </div>
  )
}
