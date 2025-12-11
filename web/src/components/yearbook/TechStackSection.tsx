
import { Section } from './Section'

interface TechStackSectionProps {
    stats: any
}

export function TechStackSection({ stats }: TechStackSectionProps) {
    const topLangs = stats.languageStats.slice(0, 8)
    const otherLangs = stats.languageStats.slice(8)
    const otherSize = otherLangs.reduce((s: number, l: any) => s + l.size, 0)
    const totalSize = stats.languageStats.reduce((s: number, l: any) => s + l.size, 0) || 1

    return (
        <div className="p-4 space-y-4">
            <Section title={`Tech Stack (${stats.languageStats.length} Languages)`}>
                {/* Stacked bar */}
                <div className="h-4 rounded-full overflow-hidden flex mb-3">
                    {topLangs.map((lang: any) => (
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
                    {stats.languageStats.slice(0, 12).map((lang: any) => (
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
                    {stats.languageStats.slice(0, 6).map((lang: any) => (
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
    )
}
