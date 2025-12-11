import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { saveToken, getToken, deleteToken, type TokenInfo } from '../services/api'

const currentYear = new Date().getFullYear()

const getPastDate = (days: number) => {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().split('T')[0]
}

const today = new Date().toISOString().split('T')[0]

const PRESETS = [
  { label: 'Past Year', start: getPastDate(365), end: today },
  { label: 'Past Month', start: getPastDate(30), end: today },
  { label: 'Past Week', start: getPastDate(7), end: today },
  { label: String(currentYear), start: `${currentYear}-01-01`, end: today },
  { label: String(currentYear - 1), start: `${currentYear - 1}-01-01`, end: `${currentYear - 1}-12-31` },
]

export default function LandingPage() {
  const [username, setUsername] = useState('')
  const [start, setStart] = useState(PRESETS[0].start)
  const [end, setEnd] = useState(PRESETS[0].end)
  const [selected, setSelected] = useState(PRESETS[0].label)
  const [showTokenModal, setShowTokenModal] = useState(false)
  const [tokenInput, setTokenInput] = useState('')
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null)
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()

  // Load token info when username changes
  useEffect(() => {
    if (username.trim()) {
      getToken(username.trim()).then(setTokenInfo).catch(() => setTokenInfo(null))
    } else {
      setTokenInfo(null)
    }
  }, [username])

  // Also check localStorage token
  const localToken = localStorage.getItem('github_token')
  const hasToken = tokenInfo?.exists || !!localToken

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim()) return
    navigate(`/yearbook/${username.trim()}/${start}/${end}?title=${encodeURIComponent(selected)}`)
  }

  const handleSaveToken = async () => {
    if (!username.trim() || !tokenInput.trim()) return
    setSaving(true)
    try {
      await saveToken(username.trim(), tokenInput.trim())
      // Also save to localStorage for immediate use
      localStorage.setItem('github_token', tokenInput.trim())
      setTokenInfo(await getToken(username.trim()))
      setTokenInput('')
      setShowTokenModal(false)
    } catch (error) {
      console.error('Failed to save token:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteToken = async () => {
    if (!username.trim()) return
    try {
      await deleteToken(username.trim())
      localStorage.removeItem('github_token')
      setTokenInfo({ exists: false })
    } catch (error) {
      console.error('Failed to delete token:', error)
    }
  }

  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-6">
          <svg className="w-12 h-12 mx-auto text-white mb-3" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
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
                  className={`flex-1 py-1.5 text-xs rounded transition-colors ${selected === p.label
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
          <div className="flex items-center justify-between text-[10px]">
            <div className="text-[#484f58]">
              {hasToken ? (
                <span className="text-[#3fb950]">● Token configured</span>
              ) : (
                <span>Public repos only</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowTokenModal(true)}
              className="text-[#58a6ff] hover:underline"
            >
              {hasToken ? 'Manage Token' : 'Add Token'}
            </button>
          </div>
        </form>

        <p className="text-center text-[10px] text-[#484f58] mt-4">
          Like <a href="https://github.com/anuraghazra/github-readme-stats" className="text-[#58a6ff] hover:underline">github-readme-stats</a>, but for yearly summaries
        </p>
      </div>

      {/* Token Modal */}
      {showTokenModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium text-white">GitHub Token Settings</h2>
              <button
                onClick={() => setShowTokenModal(false)}
                className="text-[#8b949e] hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {tokenInfo?.exists ? (
              <div className="space-y-3">
                <div className="p-3 bg-[#0d1117] rounded border border-[#30363d]">
                  <div className="text-xs text-[#8b949e] mb-1">Current Token</div>
                  <div className="text-sm text-white font-mono">{tokenInfo.masked_token}</div>
                  {tokenInfo.token_type && (
                    <div className="text-xs text-[#8b949e] mt-1">Type: {tokenInfo.token_type}</div>
                  )}
                  {tokenInfo.scopes && (
                    <div className="text-xs text-[#8b949e]">Scopes: {tokenInfo.scopes}</div>
                  )}
                </div>
                <button
                  onClick={handleDeleteToken}
                  className="w-full py-2 bg-[#da3633] hover:bg-[#b62324] text-white text-sm rounded transition-colors"
                >
                  Remove Token
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-[#8b949e] block mb-1">GitHub Personal Access Token</label>
                  <input
                    type="password"
                    value={tokenInput}
                    onChange={e => setTokenInput(e.target.value)}
                    placeholder="ghp_xxxxxxxxxxxx"
                    className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded text-sm text-white placeholder-[#484f58] focus:border-[#58a6ff] focus:outline-none"
                  />
                </div>
                <div className="text-xs text-[#8b949e]">
                  Required scopes: <code className="bg-[#21262d] px-1 rounded">repo</code>, <code className="bg-[#21262d] px-1 rounded">read:org</code>
                </div>
                <button
                  onClick={handleSaveToken}
                  disabled={!tokenInput.trim() || !username.trim() || saving}
                  className="w-full py-2 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 text-white text-sm rounded transition-colors"
                >
                  {saving ? 'Saving...' : 'Save Token'}
                </button>
                {!username.trim() && (
                  <div className="text-xs text-[#f85149]">Please enter your username first</div>
                )}
              </div>
            )}

            <div className="mt-4 pt-3 border-t border-[#30363d] text-xs text-[#8b949e]">
              <a
                href="https://github.com/settings/tokens/new?scopes=repo,read:org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#58a6ff] hover:underline"
              >
                Create a new token on GitHub
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
