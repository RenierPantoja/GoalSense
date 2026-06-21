/**
 * Daily Validation Report (B50).
 * ─────────────────────────────────────────────────────────────────────────────
 * Consolidates a day's local validation: plan/coverage/reliability/cost + backend
 * health + go/no-go into one report. Honest: unknown/not_evaluable are separated from
 * failure; provider/data limitations are separated from failure; a metric is NOT a
 * promise of accuracy. Persists keyed by date (Firebase); Noop returns empty honestly.
 */
import { createRepositories } from '../../../repositories/index.js'
import { buildProviderCoverageReport } from './providerCoverageReport.service.js'
import { buildBackendHealthReport } from './localBackendHealthReport.service.js'
import type { DailyValidationReport } from './validationCampaign.types.js'
import type {
  LocalValidationRun, LocalValidationReliabilityMetrics, LocalValidationCoverageMetrics, LocalValidationCostMetrics, LocalValidationGoNoGoReport,
} from './localValidation.types.js'

function todayStr(date = new Date()): string { return date.toISOString().slice(0, 10) }

export async function generateDailyValidationReport(date: string = todayStr()): Promise<DailyValidationReport> {
  const repos = createRepositories()
  const runs = await repos.intelligence.listLocalValidationRuns(50).catch(() => [] as LocalValidationRun[])
  const dayRuns = runs.filter(r => (r.startedAt || '').slice(0, 10) === date)
  const latest = dayRuns[0] ?? runs[0] ?? null

  const [coverageReport, health] = await Promise.all([
    Promise.resolve(buildProviderCoverageReport()),
    buildBackendHealthReport().catch(() => null),
  ])

  let reliability: LocalValidationReliabilityMetrics | null = null
  let coverage: LocalValidationCoverageMetrics | null = null
  let cost: LocalValidationCostMetrics | null = null
  let goNoGo: LocalValidationGoNoGoReport | null = null
  if (latest) {
    [reliability, coverage, cost, goNoGo] = await Promise.all([
      repos.intelligence.getLocalValidationReliabilityMetrics(latest.id).catch(() => null),
      repos.intelligence.getLocalValidationCoverageMetrics(latest.id).catch(() => null),
      repos.intelligence.getLocalValidationCostMetrics(latest.id).catch(() => null),
      repos.intelligence.getLocalValidationGoNoGoReport(latest.id).catch(() => null),
    ])
  }

  const fixturesPlanned = dayRuns.reduce((s, r) => s + (r.selectedFixtures + r.skippedFixtures), 0)
  const fixturesAnalyzed = reliability?.fixturesAnalyzed ?? dayRuns.reduce((s, r) => s + r.selectedFixtures, 0)
  const fixturesSkipped = dayRuns.reduce((s, r) => s + r.skippedFixtures, 0)

  const recommendedActions: string[] = []
  if (!health?.providerConfigured) recommendedActions.push('Configurar provider real (API_FOOTBALL_KEY + ENABLE_PROVIDER_API_FOOTBALL + mappings).')
  if ((reliability?.causalCasesNotEvaluable ?? 0) > (reliability?.causalCasesEvaluable ?? 0)) recommendedActions.push('Rodar link repair / acumular outcomes para aumentar avaliabilidade causal.')
  if ((reliability?.fixturesProviderLimited ?? 0) > 0) recommendedActions.push('Considerar manual intake para domínios ausentes.')
  recommendedActions.push('Repetir validação por 7–14 dias antes de avaliar beta.')

  const report: DailyValidationReport = {
    id: date, date, generatedAt: new Date().toISOString(),
    fixturesPlanned, fixturesAnalyzed, fixturesSkipped,
    providerConfigured: !!health?.providerConfigured,
    providerCoverage: coverageReport.domainsCovered,
    domainCoverage: coverage?.providerCoverageByDomain ?? {},
    manualIntakeUsed: reliability?.fixturesManualOnly ?? 0,
    mappingsConfirmed: 0, mappingsMissing: coverageReport.domainsBlockedByEnv.length,
    readinessDistribution: {},
    influenceSummary: { aligned: reliability?.influenceAlignedCount ?? 0, misleading: reliability?.influenceMisleadingCount ?? 0 },
    governanceSummary: {
      evaluations: reliability?.governanceEvaluations ?? 0, wouldAllow: reliability?.wouldAllow ?? 0, wouldMonitor: reliability?.wouldMonitor ?? 0,
      wouldWait: reliability?.wouldWait ?? 0, wouldBlock: reliability?.wouldBlock ?? 0,
      aligned: reliability?.governanceAlignedCount ?? 0, tooStrict: reliability?.governanceTooStrictCount ?? 0, tooLoose: reliability?.governanceTooLooseCount ?? 0,
    },
    holdsSummary: { created: reliability?.holdsCreated ?? 0, rechecked: reliability?.holdsRechecked ?? 0 },
    causalSummary: { created: reliability?.causalCasesCreated ?? 0, evaluable: reliability?.causalCasesEvaluable ?? 0, notEvaluable: reliability?.causalCasesNotEvaluable ?? 0 },
    notEvaluableSummary: { causalNotEvaluable: reliability?.causalCasesNotEvaluable ?? 0, fixturesWithoutData: (fixturesAnalyzed - (reliability?.fixturesWithSufficientData ?? 0)) },
    providerLimitations: coverageReport.domainsBlockedByEnv,
    dataLimitations: coverageReport.domainsBlockedByDocs,
    costMetrics: {
      firebaseReadsEstimated: cost?.firebaseReadsEstimated ?? 0, firebaseWritesEstimated: cost?.firebaseWritesEstimated ?? 0,
      providerCalls: cost?.providerCalls ?? 0, cacheHits: cost?.cacheHits ?? 0, cacheMisses: cost?.cacheMisses ?? 0,
    },
    backendHealth: health?.backendHealth ?? 'unknown',
    goNoGo: goNoGo?.localBackendStatus ?? 'insufficient_data',
    recommendedActions,
    limitations: [
      'Relatório diário observacional; métrica não é promessa de acerto.',
      'unknown/not_evaluable e limitação de provider são separados de falha real.',
      ...(latest ? [] : ['Nenhuma run de validação no dia — relatório parcial.']),
    ],
  }
  try { await repos.intelligence.saveDailyValidationReport(report) } catch { /* noop */ }
  return report
}

export async function getDailyValidationReport(date: string = todayStr()): Promise<DailyValidationReport | null> {
  try { return await createRepositories().intelligence.getDailyValidationReport(date) } catch { return null }
}

export async function listDailyValidationReports(limit = 30): Promise<DailyValidationReport[]> {
  try { return await createRepositories().intelligence.listDailyValidationReports(limit) } catch { return [] }
}
