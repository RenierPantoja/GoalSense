/**
 * Local Validation DTOs (B49 / Bloco 6) — frontend mirror.
 * A validation metric is NOT a promise of accuracy; go/no-go is technical, not a
 * commercial guarantee. unknown/not_evaluable are never failures.
 */

export interface ValidationPlanFixtureDto {
  fixtureId: string; teams: string; competition: string; status: string; kickoffAt: string | null
  selected: boolean; reasons: string[]; skipReasons: string[]
}
export interface LocalValidationPlanDto {
  date: string; mode: string; totalFixturesKnown: number; fixtures: ValidationPlanFixtureDto[]
  selectedCount: number; skippedCount: number
  estimatedProviderCalls: number; estimatedFirebaseReads: number; estimatedFirebaseWrites: number
  risks: string[]; limitations: string[]
}

export interface LocalValidationRunDto {
  id: string; title: string; mode: string; startedAt: string; completedAt: string | null; durationMinutes: number | null
  scope: string; fixtureIds: string[]; selectedFixtures: number; skippedFixtures: number
  providerMode: string; firebaseMode: string; governanceMode: string; causalMode: string
  status: string; errors: string[]; warnings: string[]; limitations: string[]
}

export interface LocalValidationReliabilityMetricsDto {
  runId: string; fixturesAnalyzed: number; fixturesWithSufficientData: number; fixturesProviderLimited: number; fixturesManualOnly: number
  alertsCreated: number; governanceEvaluations: number; wouldAllow: number; wouldMonitor: number; wouldWait: number; wouldBlock: number
  holdsCreated: number; holdsRechecked: number; outcomesResolved: number
  causalCasesCreated: number; causalCasesEvaluable: number; causalCasesNotEvaluable: number
  governanceAlignedCount: number; governanceTooStrictCount: number; governanceTooLooseCount: number
  influenceAlignedCount: number; influenceMisleadingCount: number; memoryUsefulCount: number; memoryMisleadingCount: number
  dataLimitationCriticalCount: number; providerLimitationCriticalCount: number; generatedAt: string
}

export interface LocalValidationCoverageMetricsDto {
  runId: string; providerCoverageByDomain: Record<string, string>
  mappingCoverage: number; lineupCoverage: number; injuryCoverage: number; suspensionCoverage: number
  standingsCoverage: number; h2hCoverage: number; squadCoverage: number; liveEventCoverage: number
  postMatchCoverage: number; evidenceCoverage: number; exactLinkCoverage: number; weakLinkCoverage: number; generatedAt: string
}

export interface LocalValidationCostMetricsDto {
  runId: string; providerCalls: number; providerCallsBlocked: number; firebaseReadsEstimated: number; firebaseWritesEstimated: number
  snapshotsWritten: number; snapshotsSkipped: number; cacheHits: number; cacheMisses: number; durationMs: number; warnings: string[]; generatedAt: string
}

export interface LocalValidationGoNoGoReportDto {
  runId: string; localBackendStatus: string; commercialReadiness: string
  reasons: string[]; blockers: string[]; warnings: string[]; requiredFixes: string[]; recommendedNextSteps: string[]; limitations: string[]; generatedAt: string
}

export interface ProviderCoverageReportDto {
  configuredProviders: string[]; unconfiguredProviders: string[]
  domainsCovered: string[]; domainsBlockedByEnv: string[]; domainsBlockedByDocs: string[]; domainsProviderNotSupported: string[]
  limitations: string[]; generatedAt: string
}

export interface BackendHealthReportDto {
  id: string; backendHealth: string; localRunReadiness: string; commercialReadiness: string
  firebaseConfigured: boolean; providerConfigured: boolean; governanceMode: string; enforceEnabled: boolean
  validationRunsObserved: number; criticalBlockers: string[]; recommendedFixes: string[]; warnings: string[]; limitations: string[]; generatedAt: string
}

export interface LinkRepairResultDto {
  fixtureId: string | null; examined: number; exactConfirmed: number; upgraded: number; unresolved: number; ambiguous: number
  links: unknown[]; limitations: string[]
}

export const BACKEND_STATUS_LABEL: Record<string, string> = {
  go: 'GO', go_with_warnings: 'GO com ressalvas', no_go: 'NO-GO', insufficient_data: 'dados insuficientes',
}
export const COMMERCIAL_READINESS_LABEL: Record<string, string> = {
  not_ready: 'não pronto', internal_alpha: 'alpha interno', controlled_beta: 'beta controlado', beta_candidate: 'candidato a beta', candidate: 'candidato', unknown: 'desconhecido',
}
export const BACKEND_HEALTH_LABEL: Record<string, string> = {
  excellent: 'excelente', good: 'bom', warning: 'atenção', blocked: 'bloqueado', unknown: 'desconhecido',
}
