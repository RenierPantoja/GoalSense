
import { ClubLogo } from '@/components/ui/ClubLogo'
import type { LiveFixture } from '@/lib/apiClient'
import { calculateRelevance } from '@/features/live/liveMatchScoring'

interface Props {
  fixture: LiveFixture
  onSelect: () => void
  onOpenDetail?: () => void
}

export function FeaturedMatchPanel({ fixture, onSelect, onOpenDetail }: Props) {

  const { reasons, dataQuality } = calculateRelevance(fixture)
  const elapsed = fixture.status.elapsed

  return (
    <div
      onClick={onSelect}
      className="relative rounded-2xl border border-cyan-500/10 bg-gradient-to-br from-[var(--bg-panel)] via-[var(--bg-panel)] to-cyan-950/10 p-6 cursor-pointer transition-all hover:border-cyan-500/20"
    >
      {/* Badge */}
      <div className="absolute top-4 right-4">
        <span className="text-[9px] font-semibold uppercase tracking-widest text-cyan-400/60">Destaque</span>
      </div>

      <div className="flex items-center justify-between gap-6">
        {/* Home */}
        <div className="flex flex-col items-center gap-2 flex-1">
          <ClubLogo src={fixture.homeTeam.logo} name={fixture.homeTeam.name} size={52} />
          <span className="text-[12px] font-semibold text-[var(--text-primary)] text-center">{fixture.homeTeam.name}</span>
        </div>

        {/* Center: score + status */}
        <div className="flex flex-col items-center gap-2 shrink-0">
          <div className="flex items-baseline gap-3">
            <span className="text-[38px] font-bold tabular-nums text-[var(--text-primary)]">{fixture.score.home ?? 0}</span>
            <span className="text-[18px] text-[var(--text-muted)]">:</span>
            <span className="text-[38px] font-bold tabular-nums text-[var(--text-primary)]">{fixture.score.away ?? 0}</span>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/15 px-3 py-1 text-[10px] font-semibold text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {elapsed ? `${elapsed}'` : 'AO VIVO'}
          </span>
          <span className="text-[10px] text-[var(--text-muted)]">{fixture.league.name}</span>
        </div>

        {/* Away */}
        <div className="flex flex-col items-center gap-2 flex-1">
          <ClubLogo src={fixture.awayTeam.logo} name={fixture.awayTeam.name} size={52} />
          <span className="text-[12px] font-semibold text-[var(--text-primary)] text-center">{fixture.awayTeam.name}</span>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-5 flex items-center justify-between text-[10px] text-[var(--text-muted)]">
        <span>{reasons.slice(0, 2).join(' · ')}</span>
        <button
          onClick={(e) => { e.stopPropagation(); onOpenDetail?.() }}
          className="text-cyan-400 font-medium hover:text-cyan-300 transition-colors"
        >
          Analisar
        </button>
      </div>
    </div>
  )
}
