import { Link } from 'react-router-dom'
import { ClubLogo } from '@/components/ui/ClubLogo'
import type { LiveFixture } from '@/lib/apiClient'

function isLive(short: string): boolean {
  return ['1H', '2H', 'ET', 'P', 'BT', 'LIVE', 'HT'].includes(short)
}

export function PremiumMatchRow({ fixture }: { fixture: LiveFixture }) {
  const live = isLive(fixture.status.short)

  return (
    <Link
      to={`/app/matches/${fixture.id}`}
      className="group flex items-center gap-4 rounded-lg border border-transparent px-4 py-3 transition-all hover:border-[var(--border-subtle)] hover:bg-[var(--bg-hover)]"
    >
      {/* League + Minute */}
      <div className="hidden sm:flex w-28 flex-col items-start gap-0.5">
        <div className="flex items-center gap-1.5">
          {fixture.league.logo && (
            <img src={fixture.league.logo} alt="" className="h-3 w-3 object-contain opacity-50" />
          )}
          <span className="truncate text-[10px] font-medium text-[var(--text-muted)]">
            {fixture.league.name}
          </span>
        </div>
        <span className="text-[10px] text-[var(--text-muted)]">{fixture.league.country}</span>
      </div>

      {/* Home team */}
      <div className="flex flex-1 items-center justify-end gap-2.5">
        <span className="truncate text-[13px] font-medium text-[var(--text-primary)] text-right">
          {fixture.homeTeam.name}
        </span>
        <ClubLogo src={fixture.homeTeam.logo} name={fixture.homeTeam.name} size={26} />
      </div>

      {/* Score */}
      <div className="flex flex-col items-center min-w-[64px]">
        <div className="flex items-center gap-2">
          <span className={`text-[18px] font-bold tabular-nums ${live ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
            {fixture.score.home ?? '-'}
          </span>
          <span className="text-[11px] text-[var(--text-muted)]">:</span>
          <span className={`text-[18px] font-bold tabular-nums ${live ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
            {fixture.score.away ?? '-'}
          </span>
        </div>
        {live && fixture.status.elapsed && (
          <span className="mt-0.5 flex items-center gap-1 text-[10px] font-medium text-emerald-400">
            <span className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse" />
            {fixture.status.elapsed}'
          </span>
        )}
        {!live && (
          <span className="mt-0.5 text-[10px] text-[var(--text-muted)]">
            {fixture.status.short}
          </span>
        )}
      </div>

      {/* Away team */}
      <div className="flex flex-1 items-center gap-2.5">
        <ClubLogo src={fixture.awayTeam.logo} name={fixture.awayTeam.name} size={26} />
        <span className="truncate text-[13px] font-medium text-[var(--text-secondary)]">
          {fixture.awayTeam.name}
        </span>
      </div>

      {/* Details indicator */}
      <span className="hidden sm:block text-[10px] text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity">
        Detalhes
      </span>
    </Link>
  )
}
