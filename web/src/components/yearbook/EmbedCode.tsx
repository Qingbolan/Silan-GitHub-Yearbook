
import { API_BASE } from '../../services/api'

interface EmbedCodeProps {
    username: string | undefined
    yearStr: string
    start: string | undefined
    end: string | undefined
}

export function EmbedCode({ username, yearStr, start, end }: EmbedCodeProps) {
    return (
        <div className="mb-6">
            <div className="text-xs text-[#8b949e] mb-1">Embed in README:</div>
            <code className="block p-2 bg-[#161b22] border border-[#30363d] rounded text-[10px] text-[#8b949e] overflow-x-auto font-mono">
                {`[![${username}'s ${yearStr} GitHub Stats](${API_BASE}/card/${username}/${start}/${end})](${window.location.href})`}
            </code>
        </div>
    )
}
