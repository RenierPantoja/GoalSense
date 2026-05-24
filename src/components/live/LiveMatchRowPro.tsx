
import { ClubLogo } from '@/components/ui/ClubLogo'
import type { LiveFixture } from '@/lib/apiClient'
import { calculateRelevance } from '@/features/live/liveMatchScoring'

interface Props {
  fixture: LiveFixture
  selected: boolean
  onSelect: () => void
  onOpenDetail?: () => void
}

export function LiveMatchRowPro({ fixture, selected, onSelect, onOpenDetail }: Props) {

  const elapsed = fixture.status.elapsed
  const { dataQuality } = calculateRelevance(fixture)

  const qualityDot: Record<string, string> = {
    complete: 'bg-emerald-400',
    good: 'bg-cyan-400',
    partial: 'bg-amber-400',
    limited: 'bg-[var(--text-muted)]',
  }

  return (
    <div
      onClick={onSelect}
      onDoubleClick={() => onOpenDetail?.()}
      className={`group flex items-center gap-3 px-4 py-3 cursor-pointer transition-all ${
        selected ? 'bg-cyan-500/5 border-l-2 border-l-cyan-400' : 'hover:bg-[var(--bg-hover)] border-l-2 border-l-transparent'
      }`}
      role="button" tabIndex={0}
    >
      {/* Status */}
      <div className="w-12 shrink-0 text-center">
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold tabular-nums text-emerald-400">
          <span className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse" />
          {elapsed || 'AO VIVO'}
        </span>
      </div>

      {/* Home */}
      <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
        <span className="truncate text-[12px] font-medium text-[var(--text-primary)] text-right">{fixture.homeTeam.name}</span>
        <ClubLogo src={fixture.homeTeam.logo} name={fixture.homeTeam.name} size={24} />
      </div>

      {/* Score */}
      <div className="flex items-center gap-1 px-2 shrink-0">
        <span className="text-[15px] font-bold tabular-nums text-[var(--text-primary)] w-4 text-right">{fixture.score.home ?? 0}</span>
        <span className="text-[10px] text-[var(--text-muted)]">-</span>
        <span className="text-[15px] font-bold tabular-nums text-[var(--text-primary)] w-4">{fixture.score.away ?? 0}</span>
      </div>

      {/* Away */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <ClubLogo src={fixture.awayTeam.logo} name={fixture.awayTeam.name} size={24} />
        <span className="truncate text-[12px] font-medium text-[var(--text-secondary)]">{fixture.awayTeam.name}</span>
      </div>

      {/* Meta */}
      <div className="hidden sm:flex items-center gap-2 shrink-0">
        <span className={`h-1.5 w-1.5 rounded-full ${qualityDot[dataQuality]}`} title={dataQuality} />
        <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] w-12 truncate">{fixture.provider}</span>
      </div>

      {/* Action */}
      <button
        onClick={(e) => { e.stopPropagation(); onOpenDetail?.() }}
        className="hidden sm:block text-[10px] font-medium text-cyan-400/40 group-hover:text-cyan-400 transition-colors shrink-0"
      >
        Analisar
      </button>
    </div>
  )
}
