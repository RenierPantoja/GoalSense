import { Link } from 'react-router-dom'
import { ClubLogo } from '@/components/ui/ClubLogo'
import { StatusPill } from '@/components/ui/StatusPill'
import type { LiveFixture } from '@/lib/apiClient'

function getVariant(short: string): 'live' | 'halftime' | 'finished' | 'scheduled' | 'default' {
  if (['1H', '2H', 'ET', 'P', 'BT', 'LIVE'].includes(short)) return 'live'
  if (short === 'HT') return 'halftime'
  if (['FT', 'AET', 'PEN'].includes(short)) return 'finished'
  if (['NS', 'TBD'].includes(short)) return 'scheduled'
  return 'default'
}

export function PremiumMatchCard({ fixture }: { fixture: LiveFixture }) {
  const variant = getVariant(fixture.status.short)
  const isLive = variant === 'live' || variant === 'halftime'

  return (
    <Link
      to={`/app/matches/${fixture.id}`}
      className="group relative flex flex-col rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4 transition-all duration-200 hover:border-cyan-500/25 hover:bg-[var(--bg-elevated)]"
    >
      {/* League header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 overflow-hidden">
          {fixture.league.logo && (
            <img src={fixture.league.logo} alt="" className="h-3.5 w-3.5 object-contain opacity-60" />
          )}
          <span className="truncate text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            {fixture.league.name}
          </span>
        </div>
        <StatusPill
          label={isLive && fixture.status.elapsed ? `${fixture.status.elapsed}'` : fixture.status.long}
          variant={variant}
        />
      </div>

      {/* Home team */}
      <div className="flex items-center justify-between py-1">
        <div className="flex items-center gap-3 overflow-hidden">
          <ClubLogo src={fixture.homeTeam.logo} name={fixture.homeTeam.name} size={28} />
          <span className="truncate text-[13px] font-medium text-[var(--text-primary)]">
            {fixture.homeTeam.name}
          </span>
        </div>
        <span className={`min-w-[24px] text-right text-lg font-bold tabular-nums ${isLive ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
          {fixture.score.home ?? '-'}
        </span>
      </div>

      {/* Away team */}
      <div className="flex items-center justify-between py-1">
        <div className="flex items-center gap-3 overflow-hidden">
          <ClubLogo src={fixture.awayTeam.logo} name={fixture.awayTeam.name} size={28} />
          <span className="truncate text-[13px] font-medium text-[var(--text-secondary)]">
            {fixture.awayTeam.name}
          </span>
        </div>
        <span className={`min-w-[24px] text-right text-lg font-bold tabular-nums ${isLive ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
          {fixture.score.away ?? '-'}
        </span>
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between border-t border-[var(--border-subtle)] pt-2.5">
        <span className="text-[10px] text-[var(--text-muted)]">
          {fixture.league.country}
        </span>
        <span className="text-[10px] font-medium text-cyan-400/70 opacity-0 transition-opacity group-hover:opacity-100">
          Detalhes
        </span>
      </div>
    </Link>
  )
}
