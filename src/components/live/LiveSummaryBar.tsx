interface Props {
  liveCount: number
  leagueCount: number
  upcomingCount: number
  enrichedCount: number
}

export function LiveSummaryBar({ liveCount, leagueCount, upcomingCount, enrichedCount }: Props) {
  return (
    <div className="flex items-center gap-3 overflow-x-auto pb-1">
      <Chip value={liveCount} label="ao vivo" accent="emerald" />
      <Chip value={leagueCount} label="ligas" accent="cyan" />
      <Chip value={upcomingCount} label="próximos" accent="slate" />
      <Chip value={enrichedCount} label="com escudos" accent="violet" />
    </div>
  )
}

function Chip({ value, label, accent }: { value: number; label: string; accent: string }) {
  const colors: Record<string, string> = {
    emerald: 'bg-emerald-500/8 text-emerald-400 border-emerald-500/15',
    cyan: 'bg-cyan-500/8 text-cyan-400 border-cyan-500/15',
    slate: 'bg-white/[0.03] text-[var(--text-muted)] border-[var(--border-subtle)]',
    violet: 'bg-violet-500/8 text-violet-400 border-violet-500/15',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium tabular-nums whitespace-nowrap ${colors[accent]}`}>
      <span className="font-bold">{value}</span>
      {label}
    </span>
  )
}
