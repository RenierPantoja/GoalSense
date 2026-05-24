
import { ClubLogo } from '@/components/ui/ClubLogo'
import type { LiveFixture } from '@/lib/apiClient'

export function PremiumMatchCard({ fixture, onOpenDetail }: { fixture: LiveFixture; onOpenDetail?: () => void }) {

  const elapsed = fixture.status.elapsed

  return (
    <div
      onClick={() => onOpenDetail?.()}
      className="group relative flex flex-col rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-5 cursor-pointer transition-all duration-200 hover:border-cyan-500/20 hover:shadow-[0_0_30px_rgba(6,182,212,0.04)]"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpenDetail?.() }}
    >
      {/* Top: League + Status */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2 overflow-hidden">
          {fixture.league.logo && (
            <img src={fixture.league.logo} alt="" className="h-4 w-4 object-contain opacity-50" />
          )}
          <span className="truncate text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            {fixture.league.name}
          </span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-[10px] font-semibold tabular-nums text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          {elapsed ? `${elapsed}'` : 'AO VIVO'}
        </span>
      </div>

      {/* Teams + Score centered */}
      <div className="flex items-center justify-between gap-3">
        {/* Home */}
        <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
          <ClubLogo src={fixture.homeTeam.logo} name={fixture.homeTeam.name} size={40} />
          <span className="text-[11px] font-medium text-[var(--text-primary)] text-center leading-tight line-clamp-2">
            {fixture.homeTeam.name}
          </span>
        </div>

        {/* Score */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[28px] font-bold tabular-nums text-[var(--text-primary)]">
            {fixture.score.home ?? 0}
          </span>
          <span className="text-[16px] text-[var(--text-muted)] font-light">:</span>
          <span className="text-[28px] font-bold tabular-nums text-[var(--text-primary)]">
            {fixture.score.away ?? 0}
          </span>
        </div>

        {/* Away */}
        <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
          <ClubLogo src={fixture.awayTeam.logo} name={fixture.awayTeam.name} size={40} />
          <span className="text-[11px] font-medium text-[var(--text-secondary)] text-center leading-tight line-clamp-2">
            {fixture.awayTeam.name}
          </span>
        </div>
      </div>

      {/* Bottom: action hint */}
      <div className="mt-5 pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between">
        <span className="text-[10px] text-[var(--text-muted)]">
          {fixture.league.country || fixture.provider}
        </span>
        <span className="text-[10px] font-medium text-cyan-400/50 group-hover:text-cyan-400 transition-colors">
          Analisar
        </span>
      </div>
    </div>
  )
}
