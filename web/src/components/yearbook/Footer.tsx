

export function Footer() {
    return (
        <div className="px-4 py-2 bg-[#161b22] border-t border-[#21262d] flex justify-between text-[10px] text-[#484f58]">
            <span>@silan-github-yearbook</span>
            <span>Generated {new Date().toLocaleDateString()}</span>
        </div>
    )
}
