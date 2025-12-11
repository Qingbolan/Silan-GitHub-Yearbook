

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <div className="text-[10px] text-[#8b949e] uppercase tracking-wider mb-2 font-medium">{title}</div>
            {children}
        </div>
    )
}
