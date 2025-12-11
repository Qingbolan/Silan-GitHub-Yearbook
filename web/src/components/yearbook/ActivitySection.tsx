
import { Section } from './Section'
import { Row } from './Row'

interface ActivitySectionProps {
    stats: any
    isCustomRange: boolean
}

export function ActivitySection({ stats, isCustomRange }: ActivitySectionProps) {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

    return (
        <div className="p-4 space-y-4">
            <Section title={isCustomRange ? `Activity (${stats.weeksCount} weeks)` : '52-Week Activity'}>
                <div className="flex gap-px h-10 rounded overflow-hidden bg-[#161b22]">
                    {stats.weeks.map((w: number, i: number) => (
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
                                {stats.organizations.map((org: any) => (
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
    )
}
