
import { ClubLogo } from '@/components/ui/ClubLogo'
import { getStatusLabel } from '@/lib/footballStatus'
import type { LiveFixture } from '@/lib/apiClient'

export function PremiumMatchRow({ fixture, onOpenDetail }: { fixture: LiveFixture; onOpenDetail?: () => void }) {

  const elapsed = fixture.status.elapsed
  const statusText = elapsed ? `${elapsed}'` : getStatusLabel(fixture.status.short)

  return (
    <div
      onClick={() => onOpenDetail?.()}
      className="group flex items-center cursor-pointer px-4 py-3 transition-colors hover:bg-[var(--bg-hover)]"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpenDetail?.() }}
    >
      {/* Status pill */}
      <div className="w-14 shrink-0">
        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-emerald-400">
          <span className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse" />
          {statusText}
        </span>
      </div>

      {/* Home team */}
      <div className="flex flex-1 items-center justify-end gap-2.5 min-w-0 pr-3">
        <span className="truncate text-[13px] font-medium text-[var(--text-primary)]">
          {fixture.homeTeam.name}
        </span>
        <ClubLogo src={fixture.homeTeam.logo} name={fixture.homeTeam.name} size={24} />
      </div>

      {/* Score */}
      <div className="flex items-center gap-1.5 px-2">
        <span className="text-[17px] font-bold tabular-nums text-[var(--text-primary)] w-5 text-right">
          {fixture.score.home ?? 0}
        </span>
        <span className="text-[12px] text-[var(--text-muted)]">&ndash;</span>
        <span className="text-[17px] font-bold tabular-nums text-[var(--text-primary)] w-5 text-left">
          {fixture.score.away ?? 0}
        </span>
      </div>

      {/* Away team */}
      <div className="flex flex-1 items-center gap-2.5 min-w-0 pl-3">
        <ClubLogo src={fixture.awayTeam.logo} name={fixture.awayTeam.name} size={24} />
        <span className="truncate text-[13px] font-medium text-[var(--text-secondary)]">
          {fixture.awayTeam.name}
        </span>
      </div>

      {/* Action */}
      <span className="hidden sm:block shrink-0 text-[10px] font-medium text-cyan-400/60 opacity-0 group-hover:opacity-100 transition-opacity ml-3">
        Analisar
      </span>
    </div>
  )
}
