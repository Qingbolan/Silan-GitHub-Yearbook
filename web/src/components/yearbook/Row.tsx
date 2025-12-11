

export function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between">
            <span className="text-[#8b949e]">{label}</span>
            <span className="text-[#c9d1d9] truncate ml-2">{value}</span>
        </div>
    )
}
