import type { LiveFixture } from '@/lib/apiClient'

export interface ChangeEvent {
  id: string
  fixtureId: number
  type: 'score_change' | 'status_change' | 'match_started' | 'halftime' | 'match_ended' | 'final_phase'
  title: string
  description: string
  createdAt: string
}

let previousSnapshot: Map<number, { scoreHome: number; scoreAway: number; status: string; elapsed: number }> = new Map()

export function detectChanges(fixtures: LiveFixture[]): ChangeEvent[] {
  const changes: ChangeEvent[] = []
  const now = new Date().toISOString()

  for (const fx of fixtures) {
    const prev = previousSnapshot.get(fx.id)
    const scoreH = fx.score.home ?? 0
    const scoreA = fx.score.away ?? 0
    const elapsed = fx.status.elapsed || 0

    if (prev) {
      // Score changed
      if (prev.scoreHome !== scoreH || prev.scoreAway !== scoreA) {
        changes.push({
          id: `${fx.id}_score_${now}`,
          fixtureId: fx.id,
          type: 'score_change',
          title: 'Placar alterado',
          description: `${fx.homeTeam.name} ${scoreH}x${scoreA} ${fx.awayTeam.name}`,
          createdAt: now,
        })
      }

      // Status changed
      if (prev.status !== fx.status.short) {
        if (fx.status.short === 'HT') {
          changes.push({ id: `${fx.id}_ht_${now}`, fixtureId: fx.id, type: 'halftime', title: 'Intervalo', description: `${fx.homeTeam.name} vs ${fx.awayTeam.name}`, createdAt: now })
        } else if (fx.status.short === 'FT') {
          changes.push({ id: `${fx.id}_ft_${now}`, fixtureId: fx.id, type: 'match_ended', title: 'Fim de jogo', description: `${fx.homeTeam.name} ${scoreH}x${scoreA} ${fx.awayTeam.name}`, createdAt: now })
        } else if (prev.status === 'NS' || prev.status === 'HT') {
          changes.push({ id: `${fx.id}_start_${now}`, fixtureId: fx.id, type: 'match_started', title: 'Jogo iniciou', description: `${fx.homeTeam.name} vs ${fx.awayTeam.name}`, createdAt: now })
        }
      }

      // Entered final phase
      if (prev.elapsed < 75 && elapsed >= 75) {
        changes.push({ id: `${fx.id}_final_${now}`, fixtureId: fx.id, type: 'final_phase', title: 'Fase final', description: `${fx.homeTeam.name} vs ${fx.awayTeam.name} aos ${elapsed}'`, createdAt: now })
      }
    }
  }

  // Update snapshot
  previousSnapshot = new Map()
  for (const fx of fixtures) {
    previousSnapshot.set(fx.id, { scoreHome: fx.score.home ?? 0, scoreAway: fx.score.away ?? 0, status: fx.status.short, elapsed: fx.status.elapsed || 0 })
  }

  return changes
}
