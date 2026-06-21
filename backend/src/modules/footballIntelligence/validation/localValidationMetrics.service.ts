/**
 * Local Validation Metrics Collector (B49 / Bloco 6).
 * ─────────────────────────────────────────────────────────────────────────────
 * Builds honest reliability/coverage/cost/readiness/go-no-go reports for a run.
 * Separates failure from limitation and not_evaluable. unknown is never failed.
 * Go/no-go is technical, not a commercial guarantee; commercial readiness cannot be
 * `beta_candidate` without provider + Firebase + real validation history.
 */
import { createRepositories } from '../../../repositories/index.js'
import { env } from '../../../env.js'
import { buildProviderStackReport } from '../providers/providerRegistry.service.js'
import type {
  LocalValidationReliabilityMetrics, LocalValidationCoverageMetrics, LocalValidationCostMetrics,
  LocalValidationReadinessReport, LocalValidationGoNoGoReport, LocalValidationFixtureSummary,
  CommercialReadiness, LocalBackendStatus,
} from './localValidation.types.js'

function pctOf(n: number, d: number): number { return d === 0 ? 0 : Math.round((n / d) * 100) }

export async function buildReliabilityMetrics(runId: string, summaries: LocalValidationFixtureSummary[]): Promise<LocalValidationReliabilityMetrics> {
  const repos = createRepositories()
  const fixturesAnalyzed = summaries.length
  let alertsCreated = 0, govEvals = 0, wouldAllow = 0, wouldMonitor = 0, wouldWait = 0, wouldBlock = 0
  let holdsCreated = 0, outcomesResolved = 0, causalCreated = 0, causalEvaluable = 0, causalNotEvaluable = 0
  let govAligned = 0, govStrict = 0, govLoose = 0

  for (const s of summaries) {
    const govs = await repos.intelligence.listGovernanceResultsByFixture(s.fixtureId, 50).catch(() => [])
    for (const g of govs) {
      govEvals++
      if (g.action === 'allow_alert') wouldAllow++
      else if (g.action === 'allow_monitor_only' || g.action === 'downgrade_to_monitor') wouldMonitor++
      else if (String(g.action).startsWith('wait_')) wouldWait++
      else if (g.action === 'block_alert' || g.action === 'stay_out') wouldBlock++
    }
    const holds = await repos.intelligence.listAlertGovernanceHolds({ fixtureId: s.fixtureId, limit: 50 }).catch(() => [])
    holdsCreated += holds.length
    const cases = await repos.intelligence.listCausalLearningCasesByFixture(s.fixtureId, 50).catch(() => [])
    causalCreated += cases.length
    for (const c of cases) {
      if (c.evaluable) causalEvaluable++; else causalNotEvaluable++
      if (c.outcomeResult === 'confirmed' || c.outcomeResult === 'confirmed_partial' || c.outcomeResult === 'failed') outcomesResolved++
      if (c.classification === 'overconservative') govStrict++
      else if (c.failureCategories?.includes('governance_too_loose') || c.failureCategories?.includes('ignored_blocker') || c.failureCategories?.includes('ignored_wait_reason')) govLoose++
      else if (c.evaluable) govAligned++
    }
  }

  return {
    runId, fixturesAnalyzed,
    fixturesWithSufficientData: summaries.filter(s => s.dataQuality === 'rich' || s.dataQuality === 'partial').length,
    fixturesProviderLimited: summaries.filter(s => s.providerLimitations.length > 0).length,
    fixturesManualOnly: summaries.filter(s => s.manualDataUsed && s.dataQuality !== 'rich').length,
    alertsCreated, governanceEvaluations: govEvals, wouldAllow, wouldMonitor, wouldWait, wouldBlock,
    holdsCreated, holdsRechecked: 0, outcomesResolved,
    causalCasesCreated: causalCreated, causalCasesEvaluable: causalEvaluable, causalCasesNotEvaluable: causalNotEvaluable,
    governanceAlignedCount: govAligned, governanceTooStrictCount: govStrict, governanceTooLooseCount: govLoose,
    influenceAlignedCount: 0, influenceMisleadingCount: 0, memoryUsefulCount: 0, memoryMisleadingCount: 0,
    dataLimitationCriticalCount: summaries.filter(s => s.dataQuality === 'poor').length,
    providerLimitationCriticalCount: summaries.filter(s => s.providerLimitations.length >= 2).length,
    generatedAt: new Date().toISOString(),
  }
}

// tiny no-op helpers removed; loop iterates the repo list directly.

export function buildCoverageMetrics(runId: string, summaries: LocalValidationFixtureSummary[]): LocalValidationCoverageMetrics {
  const stack = buildProviderStackReport()
  const total = summaries.length || 1
  const withProvider = summaries.filter(s => s.providerLimitations.length === 0).length
  const providerCoverageByDomain: Record<string, string> = {}
  for (const [domain, info] of Object.entries(stack.domainCoverage || {})) {
    providerCoverageByDomain[domain] = (info as any)?.bestProvider ? 'configured' : 'not_configured'
  }
  return {
    runId, providerCoverageByDomain,
    mappingCoverage: pctOf(withProvider, total),
    lineupCoverage: 0, injuryCoverage: pctOf(summaries.filter(s => s.manualDataUsed).length, total),
    suspensionCoverage: 0, standingsCoverage: pctOf(withProvider, total), h2hCoverage: 0,
    squadCoverage: 0, liveEventCoverage: pctOf(summaries.filter(s => s.liveMonitored).length, total),
    postMatchCoverage: pctOf(summaries.filter(s => s.postMatchResolved).length, total),
    evidenceCoverage: pctOf(summaries.filter(s => s.packageBuilt).length, total),
    exactLinkCoverage: pctOf(summaries.filter(s => s.causalEvaluated).length, total),
    weakLinkCoverage: pctOf(summaries.filter(s => s.notEvaluableReasons.length > 0).length, total),
    generatedAt: new Date().toISOString(),
  }
}

export function buildCostMetrics(runId: string, summaries: LocalValidationFixtureSummary[], cache: { hits: number; misses: number }, durationMs: number): LocalValidationCostMetrics {
  const warnings: string[] = []
  const reads = summaries.length * 12
  const writes = summaries.length * 6
  if (reads > 500) warnings.push('Leituras estimadas altas — considerar reduzir fixtures por run.')
  return {
    runId, providerCalls: 0, providerCallsBlocked: 0, firebaseReadsEstimated: reads, firebaseWritesEstimated: writes,
    snapshotsWritten: 0, snapshotsSkipped: 0, cacheHits: cache.hits, cacheMisses: cache.misses, durationMs, warnings,
    generatedAt: new Date().toISOString(),
  }
}

export async function buildReadinessReport(runId: string, summaries: LocalValidationFixtureSummary[]): Promise<LocalValidationReadinessReport> {
  const repos = createRepositories()
  const readinessDistribution: Record<string, number> = {}
  const missingCriticalDomains = new Set<string>()
  const providerNotConfigured = new Set<string>()
  for (const s of summaries) {
    for (const d of s.providerLimitations) providerNotConfigured.add(d)
    const v5 = await repos.intelligence.listGovernanceResultsByFixture(s.fixtureId, 1).catch(() => [])
    const status = v5[0]?.readinessStatus ?? (s.packageBuilt ? 'partial' : 'insufficient')
    readinessDistribution[status] = (readinessDistribution[status] || 0) + 1
    for (const d of v5[0]?.missingCriticalDomains ?? []) missingCriticalDomains.add(d)
  }
  return {
    runId, readinessDistribution, stayOutReasons: [], waitReasons: [], blockerReasons: [],
    missingCriticalDomains: [...missingCriticalDomains], providerNotConfiguredDomains: [...providerNotConfigured],
    endpointMissingDocsDomains: [], mappingMissingDomains: [],
    manualIntakeRecommended: missingCriticalDomains.size > 0 ? ['Considerar manual intake para domínios ausentes.'] : [],
    generatedAt: new Date().toISOString(),
  }
}

export function buildGoNoGoReport(runId: string, reliability: LocalValidationReliabilityMetrics, summaries: LocalValidationFixtureSummary[]): LocalValidationGoNoGoReport {
  const providerConfigured = String(env.ENABLE_PROVIDER_API_FOOTBALL).toLowerCase() === 'true'
  const firebaseConfigured = String(env.PERSISTENCE_PROVIDER) === 'firebase'
  const reasons: string[] = []
  const blockers: string[] = []
  const warnings: string[] = []
  const requiredFixes: string[] = []

  let localBackendStatus: LocalBackendStatus
  if (reliability.fixturesAnalyzed === 0) { localBackendStatus = 'insufficient_data'; reasons.push('Nenhuma fixture analisada.') }
  else if (reliability.fixturesWithSufficientData === 0) { localBackendStatus = 'go_with_warnings'; warnings.push('Nenhuma fixture com dados suficientes (provider/mapping ausentes).') }
  else { localBackendStatus = 'go'; reasons.push('Pipeline rodou localmente sem falha fatal.') }

  if (!firebaseConfigured) { warnings.push('PERSISTENCE_PROVIDER≠firebase — sem persistência de validação (Noop).'); requiredFixes.push('Configurar Firebase para reter métricas/casos.') }
  if (!providerConfigured) { warnings.push('Provider crítico não configurado — análise pré-jogo limitada.'); requiredFixes.push('Configurar API_FOOTBALL_KEY + ENABLE_PROVIDER_API_FOOTBALL + mappings.') }

  // Commercial readiness — conservative.
  let commercialReadiness: CommercialReadiness
  if (!firebaseConfigured || !providerConfigured) commercialReadiness = reliability.fixturesAnalyzed > 0 ? 'internal_alpha' : 'not_ready'
  else if (reliability.causalCasesEvaluable < 25) { commercialReadiness = 'controlled_beta'; warnings.push('Histórico de validação ainda pequeno — beta controlado, não candidato.') }
  else commercialReadiness = 'controlled_beta'
  // Never beta_candidate here without a large real validation history.
  reasons.push('beta_candidate exige provider+Firebase+histórico longo real — não atingido automaticamente.')

  return {
    runId, localBackendStatus, commercialReadiness, reasons, blockers, warnings, requiredFixes,
    recommendedNextSteps: [
      'Rodar validações diárias por vários dias reais.',
      'Configurar provider+mapping para desbloquear dados críticos.',
      'Revisar sugestões de calibração (sem aplicar automaticamente).',
    ],
    limitations: ['Go/no-go é técnico, não garantia comercial; métrica não é promessa de acerto.'],
    generatedAt: new Date().toISOString(),
  }
}

export async function collectFixtureSummaries(runId: string): Promise<LocalValidationFixtureSummary[]> {
  try { return await createRepositories().intelligence.listLocalValidationFixtureSummaries(runId) } catch { return [] }
}

export async function collectRunMetrics(runId: string, cache: { hits: number; misses: number }): Promise<void> {
  const repos = createRepositories()
  const summaries = await collectFixtureSummaries(runId)
  const reliability = await buildReliabilityMetrics(runId, summaries)
  const coverage = buildCoverageMetrics(runId, summaries)
  const cost = buildCostMetrics(runId, summaries, cache, 0)
  const readiness = await buildReadinessReport(runId, summaries)
  const goNoGo = buildGoNoGoReport(runId, reliability, summaries)
  try {
    await repos.intelligence.saveLocalValidationReliabilityMetrics(reliability)
    await repos.intelligence.saveLocalValidationCoverageMetrics(coverage)
    await repos.intelligence.saveLocalValidationCostMetrics(cost)
    await repos.intelligence.saveLocalValidationGoNoGoReport(goNoGo)
  } catch { /* noop */ }
}

export async function collectFixtureMetrics(_fixtureId: string): Promise<LocalValidationFixtureSummary | null> {
  return null
}
