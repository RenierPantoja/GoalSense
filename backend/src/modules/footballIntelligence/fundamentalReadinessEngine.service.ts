/**
 * Fundamental Analysis Readiness Engine (Match Intelligence Fabric).
 * ─────────────────────────────────────────────────────────────────────────────
 * Before analyzing, decides whether there is ENOUGH base. Returns a readiness
 * status + readiness score (NOT a probability), what critical/optional data is
 * missing, and whether pre-match / live / post-match analysis is possible. Honest:
 * missing lineup near kickoff → wait_for_lineup; empty internal memory →
 * insufficient_history; live game with no stats → wait_for_live_data.
 */
import { createRepositories } from '../../repositories/index.js'
import type { CanonicalAnalysisReadiness, ReadinessStatus } from './footballIntelligence.types.js'
import { buildSquadAvailability } from './squadAvailabilityEngine.service.js'
import { buildTeamMemory } from './teamMemoryEngine.service.js'

const LIVE = ['1H', '2H', 'HT', 'ET', 'BT', 'P']
const FINISHED = ['FT', 'AET', 'PEN']

export async function buildFundamentalReadiness(fixtureId: string): Promise<CanonicalAnalysisReadiness | null> {
  const repos = createRepositories()
  const fixture = await repos.fixtures.findById(fixtureId).catch(() => null)
  if (!fixture) return null

  const isLive = LIVE.includes(fixture.status)
  const isFinished = FINISHED.includes(fixture.status)
  const isPre = !isLive && !isFinished

  const [squad, snap, memHome, memAway] = await Promise.all([
    buildSquadAvailability(fixtureId),
    repos.liveSnapshots.findLatestByFixture(fixtureId).catch(() => null),
    buildTeamMemory(fixture.homeName || '').catch(() => null),
    buildTeamMemory(fixture.awayName || '').catch(() => null),
  ])

  const missingCritical: string[] = []
  const missingOptional: string[] = []
  const waitReasons: string[] = []

  // Pre-match data is largely absent.
  missingOptional.push('escalação', 'lesões', 'suspensões', 'tabela/classificação', 'confronto direto (H2H)', 'forma recente')

  const hasInternalMemory = (memHome?.sampleSize ?? 0) + (memAway?.sampleSize ?? 0) > 0
  if (!hasInternalMemory) missingOptional.push('memória interna dos clubes')

  const hasLiveStats = !!snap?.statsJson
  let canAnalyzeLive = false
  if (isLive) {
    if (!hasLiveStats) { waitReasons.push('Jogo ao vivo sem stats coletadas — aguardar dados ao vivo.'); missingCritical.push('stats ao vivo') }
    else canAnalyzeLive = true
  }

  // Lineup wait recommendation (temporal).
  if (squad?.waitForLineupRecommended) waitReasons.push('Escalação ainda não disponível (janela ~1h antes).')

  // Determine status.
  let status: ReadinessStatus
  if (isFinished) {
    status = 'partially_ready' // post-match study possible from snapshots
  } else if (isLive && !hasLiveStats) {
    status = 'wait_for_live_data'
  } else if (isLive && hasLiveStats) {
    status = hasInternalMemory ? 'partially_ready' : 'insufficient_history'
  } else if (isPre && squad?.waitForLineupRecommended) {
    status = 'wait_for_lineup'
  } else if (isPre) {
    // Pre-match within lineup window but we never collect lineups → provider limited.
    status = hasInternalMemory ? 'partially_ready' : 'provider_limited'
  } else {
    status = 'not_ready'
  }

  // Readiness score (0-100), readiness ONLY.
  let score = 20
  if (hasInternalMemory) score += 25
  if (hasLiveStats) score += 30
  if (isLive) score += 10
  if (isFinished) score += 15
  if (status === 'wait_for_lineup' || status === 'wait_for_live_data') score = Math.min(score, 45)
  score = Math.max(0, Math.min(100, score))

  const limitations = [
    'Prontidão ≠ probabilidade de acerto. Mede apenas se há base para analisar.',
    'Dados pré-jogo (escalação/lesões/suspensões/tabela/H2H) não são coletados — pré-jogo é provider_limited por natureza.',
  ]
  if (!hasInternalMemory) limitations.push('Sem memória interna (Firebase off ou histórico vazio) → insufficient_history, não é negativo.')

  return {
    status,
    score,
    missingCriticalData: [...new Set(missingCritical)],
    missingOptionalData: [...new Set(missingOptional)],
    waitReasons,
    canAnalyzePreMatch: isPre && hasInternalMemory,
    canAnalyzeLive,
    canAnalyzePostMatch: isFinished && !!snap,
    limitations,
  }
}

// ─── Readiness V2 (B40) — provider-aware, lineup/injury-aware ──────────────────
import { getLineupWindowStatus } from './lineupWindowEngine.service.js'
import { getBestProviderForDomain } from './providers/providerRegistry.service.js'
import { getPreMatchDomainSnapshot } from './preMatchDataStore.service.js'

export type ReadinessV2Status =
  | 'ready_for_pre_match_analysis' | 'wait_for_lineup' | 'wait_for_injury_suspension_update'
  | 'wait_for_live_confirmation' | 'provider_limited' | 'insufficient_context' | 'stay_out'

export interface FundamentalReadinessV2 {
  status: ReadinessV2Status
  score: number
  providerCoverageScore: number
  lineupReadiness: 'ready' | 'wait' | 'unavailable' | 'not_applicable'
  injurySuspensionReadiness: 'ready' | 'wait' | 'unavailable'
  squadReadiness: 'ready' | 'unavailable'
  contextReadiness: 'ready' | 'partial' | 'unknown'
  h2hReadiness: 'ready' | 'insufficient'
  memoryReadiness: 'ready' | 'insufficient'
  liveRequiredBeforeAlert: boolean
  criticalMissingDomains: string[]
  stayOutReasons: string[]
  waitReasons: string[]
  limitations: string[]
}

export async function buildFundamentalReadinessV2(fixtureId: string): Promise<FundamentalReadinessV2 | null> {
  const repos = createRepositories()
  const fixture = await repos.fixtures.findById(fixtureId).catch(() => null)
  if (!fixture) return null

  const [base, lineupWindow, memHome, memAway, injSnap, suspSnap] = await Promise.all([
    buildFundamentalReadiness(fixtureId).catch(() => null),
    getLineupWindowStatus(fixtureId).catch(() => null),
    buildTeamMemory(fixture.homeName || '').catch(() => null),
    buildTeamMemory(fixture.awayName || '').catch(() => null),
    getPreMatchDomainSnapshot(fixtureId, 'injuries').catch(() => null),
    getPreMatchDomainSnapshot(fixtureId, 'suspensions').catch(() => null),
  ])

  const isLive = LIVE.includes(fixture.status)
  const isFinished = FINISHED.includes(fixture.status)
  const hasMemory = (memHome?.sampleSize ?? 0) + (memAway?.sampleSize ?? 0) > 0

  // Provider coverage score: how many critical domains have a configured provider.
  const criticalDomains = ['confirmed_lineups', 'injuries', 'suspensions', 'standings'] as const
  const covered = criticalDomains.filter(d => !!getBestProviderForDomain(d)).length
  const providerCoverageScore = Math.round((covered / criticalDomains.length) * 100)
  const criticalMissingDomains = criticalDomains.filter(d => !getBestProviderForDomain(d))

  const stayOutReasons: string[] = []
  const waitReasons: string[] = []
  const limitations = ['Readiness V2 não é probabilidade de acerto; mede base + cobertura de provider.']

  const lineupReadiness: FundamentalReadinessV2['lineupReadiness'] =
    isLive || isFinished ? 'not_applicable'
      : lineupWindow?.status === 'confirmed_available' ? 'ready'
        : lineupWindow?.shouldWait ? 'wait'
          : 'unavailable'
  if (lineupReadiness === 'wait') waitReasons.push('Escalação ainda não disponível (janela).')

  const injReady = injSnap?.availability === 'available' || injSnap?.availability === 'partial'
  const suspReady = suspSnap?.availability === 'available' || suspSnap?.availability === 'partial'
  const injurySuspensionReadiness: FundamentalReadinessV2['injurySuspensionReadiness'] =
    injReady && suspReady ? 'ready' : (!getBestProviderForDomain('injuries') && !getBestProviderForDomain('suspensions')) ? 'unavailable' : 'wait'
  if (injurySuspensionReadiness === 'wait') waitReasons.push('Lesões/suspensões ainda não atualizadas.')

  const contextReadiness: FundamentalReadinessV2['contextReadiness'] = fixture.competition ? 'partial' : 'unknown'
  const h2hReadiness: FundamentalReadinessV2['h2hReadiness'] = 'insufficient'
  const memoryReadiness: FundamentalReadinessV2['memoryReadiness'] = hasMemory ? 'ready' : 'insufficient'
  const liveRequiredBeforeAlert = !hasMemory && providerCoverageScore < 50

  if (!hasMemory && providerCoverageScore === 0) stayOutReasons.push('Sem memória interna e sem cobertura de provider crítico.')

  // Status decision.
  let status: ReadinessV2Status
  if (isFinished) status = 'insufficient_context'
  else if (isLive && !base?.canAnalyzeLive) status = 'wait_for_live_confirmation'
  else if (lineupReadiness === 'wait') status = 'wait_for_lineup'
  else if (injurySuspensionReadiness === 'wait') status = 'wait_for_injury_suspension_update'
  else if (providerCoverageScore === 0 && !hasMemory) status = 'stay_out'
  else if (providerCoverageScore < 50) status = 'provider_limited'
  else if (!hasMemory) status = 'insufficient_context'
  else status = 'ready_for_pre_match_analysis'

  let score = 15 + Math.round(providerCoverageScore * 0.35)
  if (hasMemory) score += 20
  if (base?.canAnalyzeLive) score += 15
  if (lineupReadiness === 'ready') score += 10
  if (status === 'wait_for_lineup' || status === 'wait_for_live_confirmation') score = Math.min(score, 45)
  if (status === 'stay_out') score = Math.min(score, 25)
  score = Math.max(0, Math.min(100, score))

  if (criticalMissingDomains.length > 0) limitations.push(`Domínios críticos sem provider: ${criticalMissingDomains.join(', ')}.`)

  return {
    status, score, providerCoverageScore, lineupReadiness, injurySuspensionReadiness,
    squadReadiness: getBestProviderForDomain('squads') ? 'ready' : 'unavailable',
    contextReadiness, h2hReadiness, memoryReadiness, liveRequiredBeforeAlert,
    criticalMissingDomains, stayOutReasons, waitReasons, limitations,
  }
}
