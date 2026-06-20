/**
 * Squad / Injury / Suspension / Lineup Engine (Match Intelligence Fabric).
 * ─────────────────────────────────────────────────────────────────────────────
 * Understands who plays, who doesn't, and how much it changes the read. The backend
 * does NOT collect lineups/injuries/suspensions/squads, so this engine is HONEST:
 * it returns `not_available_yet` / `unavailable` / `provider_not_supported` and a
 * temporal readiness ("lineup usually drops ~1h before kickoff"). Unknown injury ≠
 * no injury; unknown suspension ≠ no suspension; missing lineup ≠ empty lineup.
 */
import { createRepositories } from '../../repositories/index.js'
import type { CanonicalMeta } from './footballIntelligence.types.js'

const LINEUP_RELEASE_MINUTES_BEFORE = 60 // typical pre-match lineup window

function unavailableMeta(reason: CanonicalMeta['availability'], note: string): CanonicalMeta {
  return {
    provider: null, providerIds: {}, fetchedAt: null,
    dataQuality: 'unavailable', availability: reason, reliability: 'unknown', confidenceOfData: 'unknown',
    source: 'not_collected', limitations: [note],
  }
}

export interface SquadAvailabilityProfile {
  fixtureId: string
  lineupStatus: 'unavailable' | 'probable' | 'confirmed' | 'partial' | 'not_available_yet'
  minutesToKickoff: number | null
  keyAbsences: { home: string[]; away: string[] }
  keyReturns: { home: string[]; away: string[] }
  suspensionImpact: 'unknown'
  injuryImpact: 'unknown'
  rotationRisk: 'unknown'
  benchStrength: 'unknown'
  replacementQuality: 'unknown'
  tacticalImpact: 'unknown'
  analysisImpact: 'positive' | 'negative' | 'neutral' | 'uncertain'
  waitForLineupRecommended: boolean
  limitations: string[]
  injuriesMeta: CanonicalMeta
  suspensionsMeta: CanonicalMeta
  lineupMeta: CanonicalMeta
}

export async function buildSquadAvailability(fixtureId: string): Promise<SquadAvailabilityProfile | null> {
  const repos = createRepositories()
  const fixture = await repos.fixtures.findById(fixtureId).catch(() => null)
  if (!fixture) return null

  const now = Date.now()
  const kickoff = fixture.startTime ? new Date(fixture.startTime).getTime() : null
  const minutesToKickoff = kickoff != null ? Math.round((kickoff - now) / 60000) : null
  const isLiveOrFinished = ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'FT', 'AET', 'PEN'].includes(fixture.status)

  // Honest lineup readiness: we never have lineups, but we model the temporal window.
  let lineupStatus: SquadAvailabilityProfile['lineupStatus']
  let waitForLineupRecommended = false
  if (isLiveOrFinished) {
    lineupStatus = 'unavailable' // game already started — lineup not collected
  } else if (minutesToKickoff != null && minutesToKickoff > LINEUP_RELEASE_MINUTES_BEFORE) {
    lineupStatus = 'not_available_yet'
    waitForLineupRecommended = true
  } else {
    lineupStatus = 'unavailable' // within the window but we still don't collect it
  }

  const limitations = [
    'Escalações não são coletadas pelo backend — lineupStatus reflete só a janela temporal, não dados reais.',
    'Lesões não coletadas (unknown ≠ sem lesão).',
    'Suspensões não coletadas (unknown ≠ sem suspensão).',
    'Ausências/retornos de jogadores-chave não inferíveis — listas vazias NÃO significam "ninguém fora".',
  ]
  if (waitForLineupRecommended) limitations.push(`Faltam ~${minutesToKickoff}min para o início; escalação costuma sair ~${LINEUP_RELEASE_MINUTES_BEFORE}min antes — recomendado esperar.`)

  return {
    fixtureId,
    lineupStatus,
    minutesToKickoff,
    keyAbsences: { home: [], away: [] },
    keyReturns: { home: [], away: [] },
    suspensionImpact: 'unknown',
    injuryImpact: 'unknown',
    rotationRisk: 'unknown',
    benchStrength: 'unknown',
    replacementQuality: 'unknown',
    tacticalImpact: 'unknown',
    analysisImpact: 'uncertain',
    waitForLineupRecommended,
    limitations,
    injuriesMeta: unavailableMeta('unavailable', 'Lesões não coletadas pelo backend (edge function api-football apenas).'),
    suspensionsMeta: unavailableMeta('unavailable', 'Suspensões não coletadas.'),
    lineupMeta: unavailableMeta(lineupStatus === 'not_available_yet' ? 'not_available_yet' : 'unavailable', 'Escalação não coletada pelo backend.'),
  }
}
