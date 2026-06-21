/**
 * Daily Validation Report DTOs (B50) — frontend mirror.
 * Observational; a metric is NOT a promise of accuracy; unknown/not_evaluable and
 * provider limitations are separated from failure.
 */
export interface DailyValidationReportDto {
  id: string
  date: string
  generatedAt: string
  fixturesPlanned: number
  fixturesAnalyzed: number
  fixturesSkipped: number
  providerConfigured: boolean
  providerCoverage: string[]
  domainCoverage: Record<string, string>
  manualIntakeUsed: number
  mappingsConfirmed: number
  mappingsMissing: number
  readinessDistribution: Record<string, number>
  influenceSummary: { aligned: number; misleading: number }
  governanceSummary: { evaluations: number; wouldAllow: number; wouldMonitor: number; wouldWait: number; wouldBlock: number; aligned: number; tooStrict: number; tooLoose: number }
  holdsSummary: { created: number; rechecked: number }
  causalSummary: { created: number; evaluable: number; notEvaluable: number }
  notEvaluableSummary: { causalNotEvaluable: number; fixturesWithoutData: number }
  providerLimitations: string[]
  dataLimitations: string[]
  costMetrics: { firebaseReadsEstimated: number; firebaseWritesEstimated: number; providerCalls: number; cacheHits: number; cacheMisses: number }
  backendHealth: string
  goNoGo: string
  recommendedActions: string[]
  limitations: string[]
}
