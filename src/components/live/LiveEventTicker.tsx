import type { LiveFixture } from '@/lib/apiClient'
import { displayCompetition } from '@/lib/competitionLabels'

interface Props {
  fixtures: LiveFixture[]
  onSelect: (id: number) => void
}

export function LiveEventTicker({ fixtures, onSelect }: Props) {
  if (fixtures.length === 0) return null

  // Build items showing all live games with score
  const items = fixtures.map(fx => {
    const elapsed = fx.status.elapsed
    const scoreH = fx.score.home ?? 0
    const scoreA = fx.score.away ?? 0
    return {
      id: fx.id,
      text: `${fx.homeTeam.name} ${scoreH}–${scoreA} ${fx.awayTeam.name}`,
      detail: elapsed ? `${elapsed}'` : 'AO VIVO',
      league: displayCompetition(fx.league.name, fx.league.country),
    }
  })

  // Duplicate for seamless infinite scroll
  const doubled = [...items, ...items, ...items]

  return (
    <div className="relative h-10 overflow-hidden rounded-xl border border-white/[0.04] bg-white/[0.015]">
      {/* Label */}
      <div className="absolute left-0 inset-y-0 flex items-center pl-4 pr-3 z-20 bg-gradient-to-r from-[#06080f] via-[#06080f] to-transparent">
        <span className="text-[9px] font-bold uppercase tracking-widest text-white/20">Radar</span>
      </div>
      {/* Fade edges */}
      <div className="absolute inset-y-0 left-16 w-8 bg-gradient-to-r from-[#06080f] to-transparent z-10 pointer-events-none" />
      <div className="absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-[#06080f] to-transparent z-10 pointer-events-none" />

      <div className="ticker-track flex items-center h-full gap-6 px-4">
        {doubled.map((item, i) => (
          <button
            key={`${item.id}_${i}`}
            onClick={() => onSelect(item.id)}
            className="inline-flex items-center gap-2.5 shrink-0 text-[12px] hover:text-white/70 transition-colors"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span className="font-semibold text-emerald-400 tabular-nums">{item.detail}</span>
            <span className="font-medium text-white/60">{item.text}</span>
            <span className="text-white/20 text-[10px]">{item.league}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
