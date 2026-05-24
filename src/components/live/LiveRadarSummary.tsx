import type { LiveFixture } from '@/lib/apiClient'
import type { FixtureStats } from '@/features/live/LiveScannerTable'
import { calculateAttention } from '@/features/live/attentionQueue'

interface Props {
  fixtures: LiveFixture[]
  stats: Map<number, FixtureStats>
  onFilter?: (type: string) => void
  activeFilter?: string
}

export function LiveRadarSummary({ fixtures, stats, onFilter, activeFilter }: Props) {
  if (fixtures.length === 0) return null

  const highAttention = fixtures.filter(fx => calculateAttention(fx, stats.get(fx.id)).score >= 60).length
  const finalPhase = fixtures.filter(fx => (fx.status.elapsed || 0) >= 75).length
  const withStats = fixtures.filter(fx => { const s = stats.get(fx.id); if (!s) return false; const poss = (s.possession?.home || 0) + (s.possession?.away || 0); const shots = (s.shots?.home || 0) + (s.shots?.away || 0); const ot = (s.shotsOnTarget?.home || 0) + (s.shotsOnTarget?.away || 0); const cor = (s.corners?.home || 0) + (s.corners?.away || 0); const fouls = (s.fouls?.home || 0) + (s.fouls?.away || 0); return poss > 10 || shots > 0 || ot > 0 || cor > 0 || fouls > 0 }).length
  const openGames = fixtures.filter(fx => { const g = (fx.score.home ?? 0) + (fx.score.away ?? 0); const s = stats.get(fx.id); const shots = (s?.shots?.home || 0) + (s?.shots?.away || 0); return g >= 3 || shots >= 16 }).length

  return (
    <div className="flex items-center gap-3 overflow-x-auto pb-0.5">
      <SummaryChip value={highAttention} label="Alta atenção" active={highAttention > 0} selected={activeFilter === 'high_attention'} onClick={() => onFilter?.(activeFilter === 'high_attention' ? '' : 'high_attention')} />
      <SummaryChip value={finalPhase} label="Fase final" active={finalPhase > 0} selected={activeFilter === 'final_phase'} onClick={() => onFilter?.(activeFilter === 'final_phase' ? '' : 'final_phase')} />
      <SummaryChip value={withStats} label="Com estatísticas" selected={activeFilter === 'with_stats'} onClick={() => onFilter?.(activeFilter === 'with_stats' ? '' : 'with_stats')} />
      <SummaryChip value={openGames} label="Jogos abertos" active={openGames > 0} selected={activeFilter === 'open_games'} onClick={() => onFilter?.(activeFilter === 'open_games' ? '' : 'open_games')} />
    </div>
  )
}

function SummaryChip({ value, label, active, selected, onClick }: { value: number; label: string; active?: boolean; selected?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick} className={`shrink-0 flex items-center gap-2 rounded-lg border px-3 py-2 transition-all ${selected ? 'border-cyan-500/30 bg-cyan-500/8' : active ? 'border-white/[0.08] bg-white/[0.025] hover:border-white/[0.12]' : 'border-white/[0.04] bg-white/[0.01] hover:border-white/[0.08]'}`}>
      <span className={`text-[15px] font-bold tabular-nums ${selected ? 'text-cyan-400' : active ? 'text-white/70' : 'text-white/30'}`}>{value}</span>
      <span className={`text-[11px] ${selected ? 'text-cyan-400/70' : 'text-white/30'}`}>{label}</span>
    </button>
  )
}
