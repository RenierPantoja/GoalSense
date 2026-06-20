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

// ─── Readiness V3 (B41) — provider + manual + conflict aware ───────────────────
import { buildPreMatchMergeReport } from './preMatchDataMerge.service.js'
import { getLineupWindowStatusV2 } from './lineupWindowEngine.service.js'

export type ReadinessV3Status =
  | 'ready_with_provider_data' | 'ready_with_manual_data' | 'partially_ready'
  | 'wait_for_lineup' | 'wait_for_manual_review' | 'provider_limited' | 'stay_out'

export interface FundamentalReadinessV3 {
  status: ReadinessV3Status
  score: number
  providerDataCoverage: number
  manualDataCoverage: number
  conflictPenalty: number
  lineupSourceReliability: string
  injurySourceReliability: string
  suspensionSourceReliability: string
  criticalDomainBlockers: string[]
  manualReviewRequired: boolean
  waitReasons: string[]
  stayOutReasons: string[]
  limitations: string[]
}

export async function buildFundamentalReadinessV3(fixtureId: string): Promise<FundamentalReadinessV3 | null> {
  const repos = createRepositories()
  const fixture = await repos.fixtures.findById(fixtureId).catch(() => null)
  if (!fixture) return null

  const [merge, lineupV2, v2] = await Promise.all([
    buildPreMatchMergeReport(fixtureId).catch(() => null),
    getLineupWindowStatusV2(fixtureId).catch(() => null),
    buildFundamentalReadinessV2(fixtureId).catch(() => null),
  ])

  const domains = merge?.domains ?? []
  const total = domains.length || 1
  const providerCovered = domains.filter(d => d.chosenSource === 'provider' && !d.conflict).length
  const manualCovered = domains.filter(d => d.chosenSource === 'manual').length
  const providerDataCoverage = Math.round((providerCovered / total) * 100)
  const manualDataCoverage = Math.round((manualCovered / total) * 100)
  const conflictCount = merge?.conflicts.length ?? 0
  const conflictPenalty = Math.min(40, conflictCount * 20)
  const manualReviewRequired = conflictCount > 0

  const lineupSourceReliability = lineupV2?.sourceReliability ?? 'unknown'
  const injuryMerge = domains.find(d => d.domain === 'injuries')
  const suspMerge = domains.find(d => d.domain === 'suspensions')
  const injurySourceReliability = injuryMerge?.chosenReliability ?? 'unknown'
  const suspensionSourceReliability = suspMerge?.chosenReliability ?? 'unknown'

  const criticalDomainBlockers = (v2?.criticalMissingDomains ?? []).slice()
  const waitReasons: string[] = []
  const stayOutReasons: string[] = []
  if (lineupV2?.shouldWait) waitReasons.push('Escalação ainda não confirmada.')

  let status: ReadinessV3Status
  if (manualReviewRequired) { status = 'wait_for_manual_review'; waitReasons.push('Conflito provider × manual — revisar.') }
  else if (lineupV2?.status === 'too_early' || lineupV2?.status === 'probable_available' || lineupV2?.status === 'waiting_for_provider' || lineupV2?.status === 'waiting_for_manual_confirmation') status = 'wait_for_lineup'
  else if (providerDataCoverage >= 50) status = 'ready_with_provider_data'
  else if (manualDataCoverage >= 50) status = 'ready_with_manual_data'
  else if (providerDataCoverage > 0 || manualDataCoverage > 0) status = 'partially_ready'
  else if ((v2?.providerCoverageScore ?? 0) === 0) { status = 'provider_limited' }
  else status = 'partially_ready'

  if (status === 'provider_limited' && manualDataCoverage === 0) stayOutReasons.push('Sem dado de provider nem manual para domínios críticos.')

  let score = 15 + Math.round(providerDataCoverage * 0.4 + manualDataCoverage * 0.25) - conflictPenalty
  if (status === 'ready_with_provider_data') score += 15
  if (status === 'wait_for_lineup' || status === 'wait_for_manual_review') score = Math.min(score, 45)
  score = Math.max(0, Math.min(100, score))

  return {
    status, score, providerDataCoverage, manualDataCoverage, conflictPenalty,
    lineupSourceReliability, injurySourceReliability, suspensionSourceReliability,
    criticalDomainBlockers, manualReviewRequired, waitReasons, stayOutReasons,
    limitations: ['Readiness V3 não é probabilidade; pondera cobertura provider/manual e penaliza conflito. Dado manual confiável habilita análise com badge manual.'],
  }
}

// ─── Readiness V4 (B43) — entity-mapping/domain-unlock aware ───────────────────
import { getDomainUnlockStatus } from './identity/providerBridge.service.js'
import { listManualRecordsForFixture } from './manualIntelligenceIntake.service.js'

export type ReadinessV4Status =
  | 'provider_unlocked_ready' | 'provider_unlocked_partial' | 'manual_only_ready'
  | 'wait_for_entity_mapping' | 'wait_for_operator_mapping_review' | 'provider_limited' | 'stay_out'

export interface FundamentalReadinessV4 {
  status: ReadinessV4Status
  score: number
  entityMappingReadiness: number
  providerUnlockProgress: number
  criticalDomainsBlockedByMapping: string[]
  criticalDomainsBlockedByProvider: string[]
  criticalDomainsFilledByManual: string[]
  mappingReviewRequired: boolean
  limitations: string[]
}

const V4_CRITICAL = ['confirmed_lineups', 'standings', 'injuries']
const MANUAL_FOR_DOMAIN: Record<string, string> = { confirmed_lineups: 'lineup', standings: 'context', injuries: 'injury' }

export async function buildFundamentalReadinessV4(fixtureId: string): Promise<FundamentalReadinessV4 | null> {
  const repos = createRepositories()
  const fixture = await repos.fixtures.findById(fixtureId).catch(() => null)
  if (!fixture) return null

  const [statuses, manual] = await Promise.all([
    Promise.all(V4_CRITICAL.map(d => getDomainUnlockStatus(fixtureId, d, 'api_football').catch(() => null))),
    listManualRecordsForFixture(fixtureId, 200).catch(() => []),
  ])
  const unlock = statuses.filter(Boolean) as Array<{ domain: string; currentStatus: string }>
  const unlocked = unlock.filter(s => s.currentStatus === 'unlocked').map(s => s.domain)
  const blockedByMapping = unlock.filter(s => s.currentStatus === 'blocked_missing_mapping').map(s => s.domain)
  const ambiguous = unlock.filter(s => s.currentStatus === 'blocked_ambiguous_mapping').map(s => s.domain)
  const blockedByProvider = unlock.filter(s => s.currentStatus === 'blocked_provider_not_configured' || s.currentStatus === 'blocked_endpoint_not_implemented' || s.currentStatus === 'blocked_provider_not_supported').map(s => s.domain)

  const manualDomains = new Set((manual as any[]).map(m => m.domain))
  const filledByManual = V4_CRITICAL.filter(d => manualDomains.has(MANUAL_FOR_DOMAIN[d]))

  const total = V4_CRITICAL.length
  const providerUnlockProgress = Math.round((unlocked.length / total) * 100)
  const entityMappingReadiness = Math.round(((unlocked.length + filledByManual.length) / total) * 100)
  const mappingReviewRequired = ambiguous.length > 0

  let status: ReadinessV4Status
  if (mappingReviewRequired) status = 'wait_for_operator_mapping_review'
  else if (unlocked.length === total) status = 'provider_unlocked_ready'
  else if (unlocked.length > 0) status = 'provider_unlocked_partial'
  else if (filledByManual.length >= 1) status = 'manual_only_ready'
  else if (blockedByMapping.length > 0) status = 'wait_for_entity_mapping'
  else if (blockedByProvider.length === total) status = 'provider_limited'
  else status = 'stay_out'

  let score = 20 + Math.round(providerUnlockProgress * 0.4 + (entityMappingReadiness - providerUnlockProgress) * 0.2)
  if (status === 'wait_for_operator_mapping_review' || status === 'wait_for_entity_mapping') score = Math.min(score, 45)
  score = Math.max(0, Math.min(100, score))

  return {
    status, score, entityMappingReadiness, providerUnlockProgress,
    criticalDomainsBlockedByMapping: blockedByMapping, criticalDomainsBlockedByProvider: blockedByProvider,
    criticalDomainsFilledByManual: filledByManual, mappingReviewRequired,
    limitations: ['Readiness V4 não é probabilidade; mede desbloqueio por identidade/provider + cobertura manual. Manual confiável compensa provider bloqueado, mas aparece como manual.'],
  }
}

// ─── Readiness V5 (B44) — critical data-domain readiness ───────────────────────
import { getAllDomainUnlockStatuses } from './identity/providerBridge.service.js'
import { listPreMatchDomainSnapshots, effectiveFreshness } from './preMatchDataStore.service.js'

export type ReadinessV5Status =
  | 'ready_with_real_provider_data' | 'ready_with_mixed_provider_manual_data' | 'partially_ready_provider_limited'
  | 'wait_for_lineup' | 'wait_for_domain_fetch' | 'wait_for_mapping' | 'wait_for_manual_input' | 'stay_out_data_insufficient'

export interface FundamentalReadinessV5 {
  status: ReadinessV5Status
  criticalDomainReadiness: number
  domainReliabilityScore: number
  fetchedCriticalDomains: string[]
  blockedCriticalDomains: string[]
  staleCriticalDomains: string[]
  manualCriticalDomains: string[]
  endpointMissingDocsDomains: string[]
  providerNotConfiguredDomains: string[]
  limitations: string[]
}

const V5_CRITICAL = ['confirmed_lineups', 'injuries', 'standings']
const V5_MANUAL: Record<string, string> = { confirmed_lineups: 'lineup', injuries: 'injury', standings: 'context' }

export async function buildFundamentalReadinessV5(fixtureId: string): Promise<FundamentalReadinessV5 | null> {
  const repos = createRepositories()
  const fixture = await repos.fixtures.findById(fixtureId).catch(() => null)
  if (!fixture) return null

  const [matrix, snapshots, manual] = await Promise.all([
    getAllDomainUnlockStatuses(fixtureId, 'api_football').catch(() => []),
    listPreMatchDomainSnapshots(fixtureId, 200).catch(() => []),
    listManualRecordsForFixture(fixtureId, 200).catch(() => []),
  ])
  const snapByDomain = new Map<string, any>()
  for (const s of snapshots) if (!snapByDomain.has(s.domain) || s.fetchedAt > snapByDomain.get(s.domain).fetchedAt) snapByDomain.set(s.domain, s)
  const manualKinds = new Set((manual as any[]).map(m => m.domain))

  const fetched: string[] = [], blocked: string[] = [], stale: string[] = [], manualC: string[] = []
  const endpointMissingDocs: string[] = [], providerNotConfigured: string[] = []
  for (const d of V5_CRITICAL) {
    const m = matrix.find(x => x.domain === d)
    const snap = snapByDomain.get(d)
    const usable = snap && (snap.availability === 'available' || snap.availability === 'partial' || snap.availability === 'available_empty_confirmed')
    if (usable && effectiveFreshness(snap) !== 'stale') fetched.push(d)
    else if (usable) stale.push(d)
    else if (manualKinds.has(V5_MANUAL[d])) manualC.push(d)
    else blocked.push(d)
    if (m?.endpointStatus === 'blocked_not_documented' || m?.endpointStatus === 'not_implemented') endpointMissingDocs.push(d)
    if (m?.endpointStatus === 'blocked_missing_env') providerNotConfigured.push(d)
  }

  const criticalDomainReadiness = Math.round(((fetched.length + manualC.length) / V5_CRITICAL.length) * 100)
  const domainReliabilityScore = Math.round((fetched.length / V5_CRITICAL.length) * 100)

  let status: ReadinessV5Status
  if (fetched.length === V5_CRITICAL.length) status = 'ready_with_real_provider_data'
  else if (fetched.length > 0 && manualC.length > 0) status = 'ready_with_mixed_provider_manual_data'
  else if (manualC.length >= 1 && fetched.length === 0) status = 'wait_for_manual_input'
  else if (stale.length > 0) status = 'wait_for_domain_fetch'
  else if (blocked.some(d => matrix.find(x => x.domain === d)?.currentStatus === 'blocked_missing_mapping')) status = 'wait_for_mapping'
  else if (providerNotConfigured.length === V5_CRITICAL.length || endpointMissingDocs.length === V5_CRITICAL.length) status = 'partially_ready_provider_limited'
  else if (fetched.length > 0) status = 'ready_with_mixed_provider_manual_data'
  else status = 'stay_out_data_insufficient'

  return {
    status, criticalDomainReadiness, domainReliabilityScore,
    fetchedCriticalDomains: fetched, blockedCriticalDomains: blocked, staleCriticalDomains: stale, manualCriticalDomains: manualC,
    endpointMissingDocsDomains: endpointMissingDocs, providerNotConfiguredDomains: providerNotConfigured,
    limitations: ['Readiness V5 não é probabilidade; mede cobertura real por domínio crítico (provider/manual). Ausência reduz readiness; manual confiável conta como manual.'],
  }
}

// ─── Readiness V6 (B45) — historical-memory aware ──────────────────────────────
import { buildTeamFundamentalMemory } from './memory/teamFundamentalMemory.service.js'
import { buildMatchupMemoryForFixture } from './memory/matchupFundamentalMemory.service.js'
import { getPatternMemoryForFixture } from './memory/contextualPatternMemory.service.js'

export type ReadinessV6Status =
  | 'ready_with_memory_support' | 'ready_but_memory_weak' | 'insufficient_memory'
  | 'memory_contradicts_pattern' | 'memory_requires_live_confirmation' | 'stay_out_memory_misleading'

export interface FundamentalReadinessV6 {
  status: ReadinessV6Status
  memoryReadinessScore: number
  memoryReliability: 'high' | 'medium' | 'low' | 'insufficient'
  homeMemoryState: string
  awayMemoryState: string
  matchupMaturity: string
  strongContexts: string[]
  stayOutContexts: string[]
  misleadingContexts: string[]
  memorySupportsPattern: boolean
  memoryContradictsPattern: boolean
  limitations: string[]
}

export async function buildFundamentalReadinessV6(fixtureId: string): Promise<FundamentalReadinessV6 | null> {
  const repos = createRepositories()
  const fixture = await repos.fixtures.findById(fixtureId).catch(() => null)
  if (!fixture) return null

  const [home, away, matchup, patternContext] = await Promise.all([
    fixture.homeName ? buildTeamFundamentalMemory(fixture.homeName).catch(() => null) : Promise.resolve(null),
    fixture.awayName ? buildTeamFundamentalMemory(fixture.awayName).catch(() => null) : Promise.resolve(null),
    buildMatchupMemoryForFixture(fixtureId).catch(() => null),
    getPatternMemoryForFixture(fixtureId).catch(() => []),
  ])

  const homeMemoryState = home?.memoryState ?? 'insufficient_history'
  const awayMemoryState = away?.memoryState ?? 'insufficient_history'
  const matchupMaturity = matchup?.maturity ?? 'insufficient_data'

  const strongContexts = patternContext.filter(p => p.recommendation === 'use_with_confidence').map(p => `${p.patternName}/${p.contextLabel}`)
  const stayOutContexts = patternContext.filter(p => p.recommendation === 'stay_out').map(p => `${p.patternName}/${p.contextLabel}`)
  const misleadingContexts = patternContext.filter(p => p.sample.quality === 'misleading_risk').map(p => `${p.patternName}/${p.contextLabel}`)

  const memorySupportsPattern = strongContexts.length > 0
  const memoryContradictsPattern = stayOutContexts.length > 0

  // Memory readiness score (data-confidence, NOT a probability).
  const stateScore = (s: string): number => s === 'mature' ? 30 : s === 'usable' ? 20 : s === 'developing' ? 8 : 0
  let memoryReadinessScore = stateScore(homeMemoryState) + stateScore(awayMemoryState)
  if (matchupMaturity === 'high') memoryReadinessScore += 25
  else if (matchupMaturity === 'medium') memoryReadinessScore += 12
  memoryReadinessScore = Math.max(0, Math.min(100, memoryReadinessScore))

  const reliabilities = [home?.overallSample.reliability, away?.overallSample.reliability].filter(Boolean) as string[]
  const memoryReliability: FundamentalReadinessV6['memoryReliability'] =
    reliabilities.includes('high') ? 'high'
      : reliabilities.includes('medium') ? 'medium'
        : reliabilities.includes('low') ? 'low'
          : 'insufficient'

  let status: ReadinessV6Status
  if (misleadingContexts.length > 0) status = 'stay_out_memory_misleading'
  else if (memoryContradictsPattern) status = 'memory_contradicts_pattern'
  else if (homeMemoryState === 'insufficient_history' && awayMemoryState === 'insufficient_history') status = 'insufficient_memory'
  else if (memorySupportsPattern && memoryReliability === 'high') status = 'ready_with_memory_support'
  else if (memoryReliability === 'low' || memoryReliability === 'insufficient') status = 'ready_but_memory_weak'
  else status = 'memory_requires_live_confirmation'

  return {
    status, memoryReadinessScore, memoryReliability,
    homeMemoryState, awayMemoryState, matchupMaturity,
    strongContexts, stayOutContexts, misleadingContexts,
    memorySupportsPattern, memoryContradictsPattern,
    limitations: ['Readiness V6 mede confiança da MEMÓRIA (dado), não probabilidade de acerto; memória nunca bloqueia alerta real.'],
  }
}
