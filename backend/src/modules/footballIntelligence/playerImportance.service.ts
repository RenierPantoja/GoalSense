/**
 * Player Importance Foundation (B40).
 * ─────────────────────────────────────────────────────────────────────────────
 * Begins to evaluate the impact of a player's absence/return — HONESTLY. The backend
 * has no squad/minutes/goals data, so without evidence importance is `unknown`. We
 * never call a player "key" without evidence. Sources, when present: recurring
 * lineups, internal memory, and confirmed-lineup snapshots (operator/provider).
 */
import { getPreMatchDomainSnapshot } from './preMatchDataStore.service.js'
import type { PlayerImportanceProfile } from './preMatchAcquisition.types.js'

export async function buildPlayerImportance(fixtureId: string, side: 'home' | 'away'): Promise<{ side: 'home' | 'away'; players: PlayerImportanceProfile[]; limitations: string[] }> {
  const limitations = [
    'Importância de jogador exige dados de elenco/escalação/minutos — não coletados pelo backend.',
    'Sem evidência, importanceLevel = unknown (nunca chamamos jogador de "key" sem base).',
  ]
  // Try a confirmed/probable lineup snapshot (manual or future provider).
  const snap = await getPreMatchDomainSnapshot(fixtureId, 'confirmed_lineups').catch(() => null)
  const players: PlayerImportanceProfile[] = []
  const data: any = snap?.canonicalData ?? null
  if (data && Array.isArray(data.players)) {
    for (const p of data.players) {
      players.push({
        playerId: p.playerId ?? null, playerName: String(p.name || 'unknown'), teamId: data.teamId ?? null,
        position: p.position ?? null, importanceLevel: 'unknown',
        evidence: [], dataQuality: 'partial', limitations: ['Escalação presente, mas sem métricas para inferir importância.'],
      })
    }
  }
  return { side, players, limitations }
}

export async function buildFixturePlayerImportance(fixtureId: string): Promise<{ fixtureId: string; home: PlayerImportanceProfile[]; away: PlayerImportanceProfile[]; limitations: string[] }> {
  const [home, away] = await Promise.all([buildPlayerImportance(fixtureId, 'home'), buildPlayerImportance(fixtureId, 'away')])
  return { fixtureId, home: home.players, away: away.players, limitations: ['Fundação de importância de jogador: unknown sem dados reais. Nenhuma estatística inventada.'] }
}
