import type { LiveFixture } from '@/lib/apiClient'
import type { FixtureStats } from './LiveScannerTable'

export interface QuickScanner {
  id: string
  label: string
  filter: (fx: LiveFixture, stats?: FixtureStats) => boolean
}

function hasUsefulStats(stats?: FixtureStats): boolean {
  if (!stats) return false
  const poss = (stats.possession?.home || 0) + (stats.possession?.away || 0)
  const shots = (stats.shots?.home || 0) + (stats.shots?.away || 0)
  const onTarget = (stats.shotsOnTarget?.home || 0) + (stats.shotsOnTarget?.away || 0)
  const corners = (stats.corners?.home || 0) + (stats.corners?.away || 0)
  const fouls = (stats.fouls?.home || 0) + (stats.fouls?.away || 0)
  // Cards alone are NOT sufficient — need actual match stats
  return poss > 10 || shots > 0 || onTarget > 0 || corners > 0 || fouls > 0
}

export const QUICK_SCANNERS: QuickScanner[] = [
  { id: 'all', label: 'Todos', filter: () => true },
  { id: 'draws', label: 'Empates', filter: (fx) => (fx.score.home ?? 0) === (fx.score.away ?? 0) },
  { id: 'goals', label: 'Com gols', filter: (fx) => ((fx.score.home ?? 0) + (fx.score.away ?? 0)) > 0 },
  { id: 'second_half', label: '2o tempo', filter: (fx) => (fx.status.elapsed || 0) > 45 },
  { id: 'final_phase', label: 'Fase final', filter: (fx) => (fx.status.elapsed || 0) >= 75 },
  { id: 'with_stats', label: 'Com estatísticas', filter: (_, stats) => hasUsefulStats(stats) },
  { id: 'high_shots', label: 'Muitos chutes', filter: (_, stats) => stats ? ((stats.shots?.home || 0) + (stats.shots?.away || 0)) >= 10 : false },
  { id: 'corners', label: 'Escanteios', filter: (_, stats) => stats ? ((stats.corners?.home || 0) + (stats.corners?.away || 0)) >= 5 : false },
]
