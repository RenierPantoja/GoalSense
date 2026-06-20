/**
 * Tactical Matchup Engine (Match Intelligence Fabric).
 * ─────────────────────────────────────────────────────────────────────────────
 * Confronts a pattern with the style of the match. Pre-match style data is NOT
 * collected, so pre-match is mostly `unknown`. When the match is live, it reads the
 * latest snapshot's team stats (ESPN) to estimate tempo/aggressiveness with LOW
 * reliability. Never invents tactical data; weak base → low confidence, explicit.
 */
import { createRepositories } from '../../repositories/index.js'
import type { CanonicalTacticalContext, CanonicalMeta } from './footballIntelligence.types.js'

export interface TacticalMatchupProfile {
  fixtureId: string
  expectedTempo: 'high' | 'medium' | 'low' | 'unknown'
  expectedAggressiveness: 'high' | 'medium' | 'low' | 'unknown'
  cardRisk: 'high' | 'medium' | 'low' | 'unknown'
  goalEnvironment: 'open' | 'balanced' | 'tight' | 'unknown'
  lateGoalRisk: 'high' | 'medium' | 'low' | 'unknown'
  pressureMismatch: boolean | 'unknown'
  styleConflict: boolean | 'unknown'
  patternSupport: string[]
  patternContradictions: string[]
  basis: 'live_stats' | 'none'
  limitations: string[]
  canonical: CanonicalTacticalContext
}

function num(v: unknown): number | null { const n = Number(v); return Number.isFinite(n) ? n : null }

export async function buildTacticalMatchup(fixtureId: string): Promise<TacticalMatchupProfile | null> {
  const repos = createRepositories()
  const fixture = await repos.fixtures.findById(fixtureId).catch(() => null)
  if (!fixture) return null

  const limitations = ['Estilo/tática pré-jogo não é coletado — leitura pré-jogo é unknown.']
  const snap = await repos.liveSnapshots.findLatestByFixture(fixtureId).catch(() => null)

  let expectedTempo: TacticalMatchupProfile['expectedTempo'] = 'unknown'
  let expectedAggressiveness: TacticalMatchupProfile['expectedAggressiveness'] = 'unknown'
  let cardRisk: TacticalMatchupProfile['cardRisk'] = 'unknown'
  let goalEnvironment: TacticalMatchupProfile['goalEnvironment'] = 'unknown'
  let basis: 'live_stats' | 'none' = 'none'

  if (snap?.statsJson) {
    try {
      const s = JSON.parse(snap.statsJson)
      basis = 'live_stats'
      const shots = (num(s.shotsHome) ?? 0) + (num(s.shotsAway) ?? 0)
      const fouls = (num(s.foulsHome) ?? 0) + (num(s.foulsAway) ?? 0)
      const yc = (num(s.yellowCardsHome) ?? 0) + (num(s.yellowCardsAway) ?? 0)
      const minute = num(snap.minute) ?? 1
      const per10 = (v: number) => (minute > 0 ? (v / minute) * 10 : 0)
      // Tempo from shots/10min; aggressiveness from fouls/10min; card risk from cards.
      const shotsRate = per10(shots)
      expectedTempo = shotsRate >= 4 ? 'high' : shotsRate >= 2 ? 'medium' : 'low'
      const foulRate = per10(fouls)
      expectedAggressiveness = foulRate >= 4 ? 'high' : foulRate >= 2 ? 'medium' : 'low'
      cardRisk = yc >= 5 ? 'high' : yc >= 2 ? 'medium' : 'low'
      const goals = (num(snap.scoreHome) ?? 0) + (num(snap.scoreAway) ?? 0)
      goalEnvironment = goals >= 3 ? 'open' : goals >= 1 ? 'balanced' : 'tight'
      limitations.push('Leitura tática ao vivo é estimativa de BAIXA confiabilidade a partir de stats de equipe (ESPN).')
    } catch { limitations.push('Stats do snapshot ilegíveis — leitura tática indisponível.') }
  } else {
    limitations.push('Sem stats ao vivo — leitura tática indisponível (none).')
  }

  const meta: CanonicalMeta = {
    provider: basis === 'live_stats' ? 'espn' : null, providerIds: {}, fetchedAt: snap?.capturedAt ? new Date(snap.capturedAt).toISOString() : null,
    dataQuality: basis === 'live_stats' ? 'partial' : 'unavailable', availability: basis === 'live_stats' ? 'partially_available' : 'unavailable',
    reliability: 'low', confidenceOfData: 'low', source: basis === 'live_stats' ? 'espn_live_stats' : 'not_collected', limitations,
  }

  return {
    fixtureId, expectedTempo, expectedAggressiveness, cardRisk, goalEnvironment,
    lateGoalRisk: 'unknown', pressureMismatch: 'unknown', styleConflict: 'unknown',
    patternSupport: [], patternContradictions: [], basis, limitations,
    canonical: {
      expectedTempo, expectedAggressiveness, styleConflict: 'unknown',
      notes: basis === 'live_stats' ? ['Estimativa ao vivo de baixa confiabilidade.'] : ['Sem base tática.'],
      meta,
    },
  }
}
