import { PremiumMatchRow } from './PremiumMatchRow'
import type { LiveFixture } from '@/lib/apiClient'

interface Props {
  league: LiveFixture['league']
  fixtures: LiveFixture[]
}

export function LiveLeagueSection({ league, fixtures }: Props) {
  return (
    <section>
      <div className="mb-1.5 flex items-center gap-2 px-3">
        {league.logo && (
          <img src={league.logo} alt="" className="h-3.5 w-3.5 object-contain opacity-50" />
        )}
        <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          {league.country ? `${league.country} · ` : ''}{league.name}
        </span>
        <span className="text-[10px] text-[var(--text-muted)]">
          ({fixtures.length})
        </span>
      </div>
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] overflow-hidden divide-y divide-[var(--border-subtle)]">
        {fixtures.map((fx) => (
          <PremiumMatchRow key={fx.id} fixture={fx} />
        ))}
      </div>
    </section>
  )
}
