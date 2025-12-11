

export function StatCell({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
    return (
        <div className="p-2 border-r border-b border-[#21262d] last:border-r-0">
            <div className="text-base font-bold" style={{ color }}>{value}</div>
            <div className="text-[9px] text-[#8b949e] uppercase tracking-wide">{sub || label}</div>
        </div>
    )
}
