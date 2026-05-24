import { useNavigate } from 'react-router-dom'
import { ClubLogo } from '@/components/ui/ClubLogo'
import type { LiveFixture } from '@/lib/apiClient'
import { calculateRelevance } from '@/features/live/liveMatchScoring'

interface Props {
  fixture: LiveFixture
  compact?: boolean
}

export function LiveMatchTile({ fixture, compact = false }: Props) {
  const navigate = useNavigate()
  const elapsed = fixture.status.elapsed
  const { dataQuality } = calculateRelevance(fixture)
  const isLive = fixture.status.short === 'LIVE' || fixture.status.short === 'HT' || fixture.status.short === '1H' || fixture.status.short === '2H'

  const qualityColors: Record<string, string> = {
    complete: 'bg-emerald-400',
    good: 'bg-cyan-400',
    partial: 'bg-amber-400',
    limited: 'bg-[var(--text-muted)]',
  }

  if (compact) {
    return (
      <div
        onClick={() => navigate(`/app/matches/${fixture.id}`)}
        className="group flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)]/50 px-4 py-3 cursor-pointer transition-all hover:border-[var(--border-strong)] hover:bg-[var(--bg-panel)]"
        role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/app/matches/${fixture.id}`) }}
      >
        <span className="text-[10px] tabular-nums text-[var(--text-muted)] w-12">
          {new Date(fixture.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </span>
        <ClubLogo src={fixture.homeTeam.logo} name={fixture.homeTeam.name} size={20} />
        <span className="text-[11px] text-[var(--text-secondary)] truncate flex-1">{fixture.homeTeam.name}</span>
        <span className="text-[10px] text-[var(--text-muted)]">vs</span>
        <span className="text-[11px] text-[var(--text-secondary)] truncate flex-1 text-right">{fixture.awayTeam.name}</span>
        <ClubLogo src={fixture.awayTeam.logo} name={fixture.awayTeam.name} size={20} />
      </div>
    )
  }

  return (
    <div
      onClick={() => navigate(`/app/matches/${fixture.id}`)}
      className="group relative flex flex-col rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-5 cursor-pointer transition-all duration-200 hover:border-cyan-500/20 hover:shadow-[0_0_40px_rgba(6,182,212,0.03)]"
      role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/app/matches/${fixture.id}`) }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2 overflow-hidden">
          {fixture.league.logo && <img src={fixture.league.logo} alt="" className="h-3.5 w-3.5 object-contain opacity-50" />}
          <span className="truncate text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            {fixture.league.name}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full ${qualityColors[dataQuality]}`} title={`Qualidade: ${dataQuality}`} />
          {isLive ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-[10px] font-semibold tabular-nums text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {elapsed ? `${elapsed}'` : 'AO VIVO'}
            </span>
          ) : (
            <span className="text-[10px] text-[var(--text-muted)]">{fixture.status.short}</span>
          )}
        </div>
      </div>

      {/* Teams + Score */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col items-center gap-2.5 flex-1 min-w-0">
          <ClubLogo src={fixture.homeTeam.logo} name={fixture.homeTeam.name} size={42} />
          <span className="text-[11px] font-medium text-[var(--text-primary)] text-center leading-tight line-clamp-2">
            {fixture.homeTeam.name}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[26px] font-bold tabular-nums text-[var(--text-primary)]">
            {fixture.score.home ?? 0}
          </span>
          <span className="text-[14px] text-[var(--text-muted)]">:</span>
          <span className="text-[26px] font-bold tabular-nums text-[var(--text-primary)]">
            {fixture.score.away ?? 0}
          </span>
        </div>

        <div className="flex flex-col items-center gap-2.5 flex-1 min-w-0">
          <ClubLogo src={fixture.awayTeam.logo} name={fixture.awayTeam.name} size={42} />
          <span className="text-[11px] font-medium text-[var(--text-secondary)] text-center leading-tight line-clamp-2">
            {fixture.awayTeam.name}
          </span>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-5 pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between">
        <span className="text-[9px] font-medium uppercase tracking-wider text-[var(--text-muted)]">{fixture.provider}</span>
        <span className="text-[10px] font-medium text-cyan-400/50 group-hover:text-cyan-400 transition-colors">Analisar</span>
      </div>
    </div>
  )
}
