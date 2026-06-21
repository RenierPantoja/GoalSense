/**
 * Local Long-Run Validation — Contracts (B49 / Bloco 6).
 * ─────────────────────────────────────────────────────────────────────────────
 * Measures whether the local backend can run a full day of fixtures: coverage,
 * reliability, cost and go/no-go. Inviolable rules encoded:
 *   - a validation metric is NOT a promise of future accuracy;
 *   - go/no-go is technical, not a commercial guarantee;
 *   - unknown / not_evaluable are never `failed`; provider/data limitations are
 *     separated from real failures; enforce stays off; shadow never blocks alerts.
 */

export type LocalValidationMode = 'dry_run' | 'shadow_only' | 'observe' | 'full_local_validation'

export type LocalValidationRunStatus =
  | 'scheduled' | 'running' | 'completed' | 'completed_with_warnings' | 'failed' | 'cancelled' | 'expired'

export interface LocalValidationRun {
  id: string
  title: string
  mode: LocalValidationMode
  startedAt: string
  completedAt: string | null
  durationMinutes: number | null
  scope: 'today' | 'fixture_list' | 'competition' | 'manual'
  fixtureIds: string[]
  selectedFixtures: number
  skippedFixtures: number
  providerMode: string
  firebaseMode: string
  governanceMode: string
  causalMode: string
  status: LocalValidationRunStatus
  errors: string[]
  warnings: string[]
  limitations: string[]
}

export interface LocalValidationFixtureSummary {
  id: string
  runId: string
  fixtureId: string
  teams: string
  competition: string
  status: string
  kickoffTime: string | null
  selected: boolean
  skipReason: string | null
  preMatchAcquired: boolean
  liveMonitored: boolean
  postMatchResolved: boolean
  packageBuilt: boolean
  memoryBuilt: boolean
  influenceBuilt: boolean
  governanceEvaluated: boolean
  causalEvaluated: boolean
  dataQuality: string
  providerLimitations: string[]
  manualDataUsed: boolean
  notEvaluableReasons: string[]
  createdAt: string
}

export interface LocalValidationReliabilityMetrics {
  runId: string
  fixturesAnalyzed: number
  fixturesWithSufficientData: number
  fixturesProviderLimited: number
  fixturesManualOnly: number
  alertsCreated: number
  governanceEvaluations: number
  wouldAllow: number
  wouldMonitor: number
  wouldWait: number
  wouldBlock: number
  holdsCreated: number
  holdsRechecked: number
  outcomesResolved: number
  causalCasesCreated: number
  causalCasesEvaluable: number
  causalCasesNotEvaluable: number
  governanceAlignedCount: number
  governanceTooStrictCount: number
  governanceTooLooseCount: number
  influenceAlignedCount: number
  influenceMisleadingCount: number
  memoryUsefulCount: number
  memoryMisleadingCount: number
  dataLimitationCriticalCount: number
  providerLimitationCriticalCount: number
  generatedAt: string
}

export interface LocalValidationCoverageMetrics {
  runId: string
  providerCoverageByDomain: Record<string, string>
  mappingCoverage: number
  lineupCoverage: number
  injuryCoverage: number
  suspensionCoverage: number
  standingsCoverage: number
  h2hCoverage: number
  squadCoverage: number
  liveEventCoverage: number
  postMatchCoverage: number
  evidenceCoverage: number
  exactLinkCoverage: number
  weakLinkCoverage: number
  generatedAt: string
}

export interface LocalValidationCostMetrics {
  runId: string
  providerCalls: number
  providerCallsBlocked: number
  firebaseReadsEstimated: number
  firebaseWritesEstimated: number
  snapshotsWritten: number
  snapshotsSkipped: number
  cacheHits: number
  cacheMisses: number
  durationMs: number
  warnings: string[]
  generatedAt: string
}

export interface LocalValidationReadinessReport {
  runId: string
  readinessDistribution: Record<string, number>
  stayOutReasons: string[]
  waitReasons: string[]
  blockerReasons: string[]
  missingCriticalDomains: string[]
  providerNotConfiguredDomains: string[]
  endpointMissingDocsDomains: string[]
  mappingMissingDomains: string[]
  manualIntakeRecommended: string[]
  generatedAt: string
}

export type LocalBackendStatus = 'go' | 'go_with_warnings' | 'no_go' | 'insufficient_data'
export type CommercialReadiness = 'not_ready' | 'internal_alpha' | 'controlled_beta' | 'beta_candidate' | 'candidate' | 'unknown'

export interface LocalValidationGoNoGoReport {
  runId: string
  localBackendStatus: LocalBackendStatus
  commercialReadiness: CommercialReadiness
  reasons: string[]
  blockers: string[]
  warnings: string[]
  requiredFixes: string[]
  recommendedNextSteps: string[]
  limitations: string[]
  generatedAt: string
}

export type BackendHealth = 'excellent' | 'good' | 'warning' | 'blocked' | 'unknown'
export type LocalRunReadiness = 'ready' | 'ready_with_warnings' | 'not_ready'

export interface BackendHealthReport {
  id: string
  backendHealth: BackendHealth
  localRunReadiness: LocalRunReadiness
  commercialReadiness: CommercialReadiness
  firebaseConfigured: boolean
  providerConfigured: boolean
  governanceMode: string
  enforceEnabled: boolean
  validationRunsObserved: number
  criticalBlockers: string[]
  recommendedFixes: string[]
  warnings: string[]
  limitations: string[]
  generatedAt: string
}

export interface ValidationPlanFixture {
  fixtureId: string
  teams: string
  competition: string
  status: string
  kickoffAt: string | null
  selected: boolean
  reasons: string[]
  skipReasons: string[]
}

export interface LocalValidationPlan {
  date: string
  mode: LocalValidationMode
  totalFixturesKnown: number
  fixtures: ValidationPlanFixture[]
  selectedCount: number
  skippedCount: number
  estimatedProviderCalls: number
  estimatedFirebaseReads: number
  estimatedFirebaseWrites: number
  risks: string[]
  limitations: string[]
}
