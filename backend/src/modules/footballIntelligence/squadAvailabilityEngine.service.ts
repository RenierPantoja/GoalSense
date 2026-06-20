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

// ─── Squad availability with manual + provider (B41) ───────────────────────────
import { listManualRecordsForFixture } from './manualIntelligenceIntake.service.js'
import { getPreMatchDomainSnapshot } from './preMatchDataStore.service.js'

export interface SquadAvailabilityV2 {
  fixtureId: string
  injuries: { source: 'provider' | 'manual' | 'none'; available: boolean; items: Array<{ playerName: string; reason: string; reliability: string }>; limitations: string[] }
  suspensions: { source: 'provider' | 'manual' | 'none'; available: boolean; items: Array<{ playerName: string; reason: string; reliability: string }>; limitations: string[] }
  injuryImpact: 'unknown' | 'possible' | 'high'
  suspensionImpact: 'unknown' | 'possible' | 'high'
  limitations: string[]
}

export async function buildSquadAvailabilityV2(fixtureId: string): Promise<SquadAvailabilityV2> {
  const [manual, injSnap, suspSnap] = await Promise.all([
    listManualRecordsForFixture(fixtureId, 200).catch(() => []),
    getPreMatchDomainSnapshot(fixtureId, 'injuries').catch(() => null),
    getPreMatchDomainSnapshot(fixtureId, 'suspensions').catch(() => null),
  ])
  const manualInjuries = manual.filter(m => m.domain === 'injury')
  const manualSuspensions = manual.filter(m => m.domain === 'suspension')

  const providerInjAvailable = injSnap && (injSnap.availability === 'available' || injSnap.availability === 'available_empty_confirmed' || injSnap.availability === 'partial')
  const providerSuspAvailable = suspSnap && (suspSnap.availability === 'available' || suspSnap.availability === 'available_empty_confirmed' || suspSnap.availability === 'partial')

  const injItems = manualInjuries.map(m => ({ playerName: String((m.payload as any)?.playerName || 'desconhecido'), reason: String((m.payload as any)?.reason || m.note || 'lesão'), reliability: m.reliability }))
  const suspItems = manualSuspensions.map(m => ({ playerName: String((m.payload as any)?.playerName || 'desconhecido'), reason: String((m.payload as any)?.reason || m.note || 'suspensão'), reliability: m.reliability }))

  const injuries: SquadAvailabilityV2['injuries'] = {
    source: providerInjAvailable ? 'provider' : injItems.length ? 'manual' : 'none',
    available: !!providerInjAvailable || injItems.length > 0,
    items: injItems,
    limitations: providerInjAvailable || injItems.length ? [] : ['Lesões indisponíveis — unknown ≠ "sem lesão".'],
  }
  const suspensions: SquadAvailabilityV2['suspensions'] = {
    source: providerSuspAvailable ? 'provider' : suspItems.length ? 'manual' : 'none',
    available: !!providerSuspAvailable || suspItems.length > 0,
    items: suspItems,
    limitations: providerSuspAvailable || suspItems.length ? [] : ['Suspensões indisponíveis — unknown ≠ "sem suspensão".'],
  }

  // Impact stays conservative: only "possible" when we actually have an absence; never
  // "high" without player-importance evidence (which we lack).
  const injuryImpact: SquadAvailabilityV2['injuryImpact'] = injItems.length > 0 ? 'possible' : 'unknown'
  const suspensionImpact: SquadAvailabilityV2['suspensionImpact'] = suspItems.length > 0 ? 'possible' : 'unknown'

  return {
    fixtureId, injuries, suspensions, injuryImpact, suspensionImpact,
    limitations: ['Ausência indisponível nunca vira "sem ausência"; impacto exige importância de jogador (unknown sem dados).'],
  }
}
