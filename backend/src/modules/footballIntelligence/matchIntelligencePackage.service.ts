/**
 * Match Intelligence Package (Match Intelligence Fabric).
 * ─────────────────────────────────────────────────────────────────────────────
 * The central package: consolidates context, squad/availability, team memory, H2H,
 * tactical matchup, readiness, live state and (when finished) post-match — plus the
 * decision-input ledger split into positive / negative / uncertain. It does NOT
 * decide an alert here; it only PREPARES inputs honestly. Never invents a variable.
 */
import { createRepositories } from '../../repositories/index.js'
import { buildMatchContext, type MatchContextProfile } from './matchContextEngine.service.js'
import { buildSquadAvailability, type SquadAvailabilityProfile } from './squadAvailabilityEngine.service.js'
import { buildTeamMemory, type TeamIntelligenceMemory } from './teamMemoryEngine.service.js'
import { buildHeadToHead, type HeadToHeadIntelligence } from './headToHeadIntelligence.service.js'
import { buildTacticalMatchup, type TacticalMatchupProfile } from './tacticalMatchupEngine.service.js'
import { buildFundamentalReadiness } from './fundamentalReadinessEngine.service.js'
import { buildDecisionInputs, type DecisionInputBundle } from './decisionInputLedger.service.js'
import type { CanonicalFixture, CanonicalAnalysisReadiness, CanonicalMeta } from './footballIntelligence.types.js'

const LIVE = ['1H', '2H', 'HT', 'ET', 'BT', 'P']
const FINISHED = ['FT', 'AET', 'PEN']

export type MatchPhase = 'pre_match' | 'lineup_window' | 'live' | 'half_time' | 'post_match'

export interface MatchLivePackage {
  minute: number | null
  score: { home: number; away: number } | null
  status: string
  dataQuality: string
  hasStats: boolean
  recentEvents: Array<{ minute: number; type: string; side: string }>
}

export interface MatchPostMatchPackage {
  finalScore: { home: number; away: number } | null
  totalGoals: number | null
  events: Array<{ minute: number; type: string; side: string }>
}

export interface MatchIntelligencePackage {
  fixtureId: string
  generatedAt: string
  phase: MatchPhase
  fixture: CanonicalFixture
  readiness: CanonicalAnalysisReadiness | null
  context: MatchContextProfile | null
  teams: { home: TeamIntelligenceMemory | null; away: TeamIntelligenceMemory | null }
  h2h: HeadToHeadIntelligence | null
  squads: SquadAvailabilityProfile | null
  tactical: TacticalMatchupProfile | null
  live: MatchLivePackage | null
  postMatch: MatchPostMatchPackage | null
  decisionInputs: DecisionInputBundle
  positiveFactors: string[]
  negativeFactors: string[]
  uncertaintyFactors: string[]
  stayOutReasons: string[]
  waitReasons: string[]
  limitations: string[]
}

function derivePhase(status: string, minutesToKickoff: number | null): MatchPhase {
  if (FINISHED.includes(status)) return 'post_match'
  if (status === 'HT') return 'half_time'
  if (LIVE.includes(status)) return 'live'
  if (minutesToKickoff != null && minutesToKickoff <= 75) return 'lineup_window'
  return 'pre_match'
}

function fixtureMeta(provider: string | null): CanonicalMeta {
  return {
    provider, providerIds: {}, fetchedAt: new Date().toISOString(),
    dataQuality: 'partial', availability: 'available', reliability: 'medium', confidenceOfData: 'medium',
    source: 'backend_fixture', limitations: [],
  }
}

function parseEvents(snap: any): Array<{ minute: number; type: string; side: string }> {
  if (!snap?.eventsJson) return []
  try {
    const arr = JSON.parse(snap.eventsJson) as any[]
    return arr.slice(-8).map(e => ({ minute: Number(e.minute) || 0, type: String(e.type || 'unknown'), side: String(e.side || 'unknown') }))
  } catch { return [] }
}

export async function buildMatchIntelligencePackage(fixtureId: string): Promise<MatchIntelligencePackage | null> {
  const repos = createRepositories()
  const fixture = await repos.fixtures.findById(fixtureId).catch(() => null)
  if (!fixture) return null

  const now = Date.now()
  const kickoff = fixture.startTime ? new Date(fixture.startTime).getTime() : null
  const minutesToKickoff = kickoff != null ? Math.round((kickoff - now) / 60000) : null
  const phase = derivePhase(fixture.status, minutesToKickoff)

  const [context, squad, memHome, memAway, h2h, tactical, readiness, snap] = await Promise.all([
    buildMatchContext(fixtureId).catch(() => null),
    buildSquadAvailability(fixtureId).catch(() => null),
    buildTeamMemory(fixture.homeName || '').catch(() => null),
    buildTeamMemory(fixture.awayName || '').catch(() => null),
    buildHeadToHead(fixture.homeName || '', fixture.awayName || '').catch(() => null),
    buildTacticalMatchup(fixtureId).catch(() => null),
    buildFundamentalReadiness(fixtureId).catch(() => null),
    repos.liveSnapshots.findLatestByFixture(fixtureId).catch(() => null),
  ])

  const isLive = LIVE.includes(fixture.status)
  const isFinished = FINISHED.includes(fixture.status)

  const live: MatchLivePackage | null = (isLive || isFinished) && snap ? {
    minute: snap.minute ?? null,
    score: { home: snap.scoreHome ?? 0, away: snap.scoreAway ?? 0 },
    status: snap.status || fixture.status,
    dataQuality: snap.dataQuality || 'unknown',
    hasStats: !!snap.statsJson,
    recentEvents: parseEvents(snap),
  } : null

  const postMatch: MatchPostMatchPackage | null = isFinished && snap ? {
    finalScore: { home: snap.scoreHome ?? 0, away: snap.scoreAway ?? 0 },
    totalGoals: (snap.scoreHome ?? 0) + (snap.scoreAway ?? 0),
    events: parseEvents(snap),
  } : null

  const decisionInputs = buildDecisionInputs({ fixtureId, context, squad, memoryHome: memHome, memoryAway: memAway, h2h, tactical, readiness })

  const positiveFactors = decisionInputs.positive.map(d => `${d.variableName}: ${d.value}`)
  const negativeFactors = decisionInputs.negative.map(d => `${d.variableName}: ${d.value}`)
  const uncertaintyFactors = decisionInputs.uncertain.concat(decisionInputs.contextual).map(d => `${d.variableName}: ${d.value}`)
  const stayOutReasons: string[] = []
  const waitReasons: string[] = [...(readiness?.waitReasons ?? [])]

  if (squad?.waitForLineupRecommended) waitReasons.push('Escalação ainda não disponível — esperar.')
  if (isLive && !snap?.statsJson) waitReasons.push('Jogo ao vivo sem stats — aguardar dados ao vivo.')
  if ((memHome?.sampleSize ?? 0) + (memAway?.sampleSize ?? 0) === 0) stayOutReasons.push('Sem memória interna dos clubes (insufficient_history).')
  if (context?.volatilityRisk === 'high') stayOutReasons.push('Contexto muito volátil (mata-mata/decisão).')

  const fixtureCanon: CanonicalFixture = {
    fixtureId: String(fixture.id), canonicalKey: fixture.canonicalKey ?? null,
    homeTeam: fixture.homeName || 'unknown', awayTeam: fixture.awayName || 'unknown', competition: fixture.competition || 'unknown',
    status: fixture.status, minute: snap?.minute ?? null, scoreHome: snap?.scoreHome ?? null, scoreAway: snap?.scoreAway ?? null,
    kickoffAt: fixture.startTime ? new Date(fixture.startTime).toISOString() : null, meta: fixtureMeta(fixture.provider ?? null),
  }

  const limitations = [
    'Pacote observacional: prepara insumos, NÃO decide alerta.',
    'Dados pré-jogo (escalação/lesões/suspensões/tabela/H2H/árbitro) não coletados — marcados honestamente.',
  ]

  return {
    fixtureId, generatedAt: new Date().toISOString(), phase,
    fixture: fixtureCanon, readiness, context,
    teams: { home: memHome, away: memAway }, h2h, squads: squad, tactical,
    live, postMatch, decisionInputs,
    positiveFactors, negativeFactors, uncertaintyFactors, stayOutReasons, waitReasons, limitations,
  }
}
