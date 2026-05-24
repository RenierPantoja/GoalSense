interface Props {
  live: number
  leagues: number
  upcoming: number
  enriched: number
}

export function LiveMetricsStrip({ live, leagues, upcoming, enriched }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <MetricCard value={live} label="Ao vivo agora" sublabel="partidas em andamento" accent="emerald" />
      <MetricCard value={leagues} label="Ligas ativas" sublabel="com jogos ao vivo" accent="cyan" />
      <MetricCard value={upcoming} label="Próximos 3h" sublabel="prestes a iniciar" accent="slate" />
      <MetricCard value={enriched} label="Dados completos" sublabel="escudos + provider" accent="violet" />
    </div>
  )
}

function MetricCard({ value, label, sublabel, accent }: { value: number; label: string; sublabel: string; accent: string }) {
  const accents: Record<string, string> = {
    emerald: 'border-emerald-500/10 text-emerald-400',
    cyan: 'border-cyan-500/10 text-cyan-400',
    slate: 'border-[var(--border-subtle)] text-[var(--text-secondary)]',
    violet: 'border-violet-500/10 text-violet-400',
  }
  const numColor: Record<string, string> = {
    emerald: 'text-emerald-400',
    cyan: 'text-cyan-400',
    slate: 'text-[var(--text-primary)]',
    violet: 'text-violet-400',
  }

  return (
    <div className={`rounded-xl border bg-[var(--bg-panel)] p-3.5 ${accents[accent]}`}>
      <span className={`text-[22px] font-bold tabular-nums ${numColor[accent]}`}>{value}</span>
      <p className="text-[11px] font-medium text-[var(--text-secondary)] mt-0.5">{label}</p>
      <p className="text-[9px] text-[var(--text-muted)]">{sublabel}</p>
    </div>
  )
}
