/**
 * Validation Campaign + Daily Report + Controlled-Beta Readiness — Contracts (B50).
 * ─────────────────────────────────────────────────────────────────────────────
 * Groups daily validation reports across a 7–14 day campaign and derives an honest,
 * conservative controlled-beta readiness. A metric is NOT a promise of accuracy;
 * readiness is technical, not a commercial guarantee. unknown/not_evaluable are never
 * failures; provider/data limitations are separated from failure.
 */

export interface DailyValidationReport {
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
  workerRuns: number
  workerSessionsCompleted: number
  orphanSessionsDetected: number
  orphanSessionsRecovered: number
  postMatchSweeperRuns: number
  liveFirstCompletedFixtures: number
  liveFirstPendingPostMatch: number
  liveFirstEvaluableCases: number
  liveFirstNotEvaluableReasons: Record<string, number>
  averageSessionDurationMinutes: number
  averageSnapshotsPerCompletedFixture: number
  notEvaluableSummary: { causalNotEvaluable: number; fixturesWithoutData: number }
  providerLimitations: string[]
  dataLimitations: string[]
  costMetrics: { firebaseReadsEstimated: number; firebaseWritesEstimated: number; providerCalls: number; cacheHits: number; cacheMisses: number }
  backendHealth: string
  goNoGo: string
  recommendedActions: string[]
  limitations: string[]
}

export type ValidationCampaignStatus = 'running' | 'completed' | 'cancelled'

export interface ValidationCampaign {
  id: string
  title: string
  startedAt: string
  endedAt: string | null
  status: ValidationCampaignStatus
  targetDays: number
  actualDays: number
  dailyReportIds: string[]
  aggregateMetrics: {
    fixturesAnalyzed: number
    fixturesWithData: number
    governanceEvaluations: number
    causalEvaluable: number
    causalNotEvaluable: number
    providerLimitedFixtures: number
    liveMonitoringHours: number
    completedLiveFirstFixtures: number
    evaluableLiveFirstCases: number
    orphanRecoveryCount: number
    postMatchSweeperCount: number
  }
  blockers: string[]
  warnings: string[]
  finalRecommendation: string
  limitations: string[]
}

export type ControlledBetaStatus = 'not_ready' | 'internal_alpha' | 'controlled_beta_possible' | 'blocked'

export interface ControlledBetaReadinessReport {
  status: ControlledBetaStatus
  reasons: string[]
  hardBlockers: string[]
  softBlockers: string[]
  providerRequirements: string[]
  validationRequirements: string[]
  operationalRequirements: string[]
  securityRequirements: string[]
  nextActions: string[]
  limitations: string[]
  generatedAt: string
}
