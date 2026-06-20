/**
 * Live Validation Sessions — contracts (Phase B37).
 * ─────────────────────────────────────────────────────────────────────────────
 * A session is an OBSERVATIONAL operational lens over local live validation: a
 * fixture scope + goals + an auditable timeline + an honest summary/report. It
 * NEVER alters triggers/results/scores/outcomes, never starts workers, never
 * invents data. Coverage-absent is not a failure; provider-unavailable is explicit.
 */

export type LiveValidationSessionStatus =
  | 'draft' | 'ready' | 'running' | 'paused' | 'completed' | 'cancelled' | 'failed_non_fatal'

export interface LiveValidationFixtureScope {
  competitionIds?: string[]
  leagueNames?: string[]
  fixtureIds?: string[]
  teamIds?: string[]
  teamNames?: string[]
  maxFixtures?: number
  onlyLive?: boolean
  includeScheduled?: boolean
  excludeFinished?: boolean
}

export type LiveValidationGoal =
  | 'validateProviderCoverage'
  | 'validateSnapshots'
  | 'validateAlerts'
  | 'validateAutoEngine'
  | 'validateBacktestReplay'
  | 'validateEvidenceLineage'
  | 'validateOperationalCost'

export interface LiveValidationSession {
  id: string
  name: string
  description: string | null
  status: LiveValidationSessionStatus
  createdAt: string
  startedAt: string | null
  pausedAt: string | null
  completedAt: string | null
  cancelledAt: string | null
  createdBy: string | null
  provider: string
  appEnv: string
  localRuntimeProfile: string
  guardMode: string
  fixtureScope: LiveValidationFixtureScope
  goals: LiveValidationGoal[]
  notes: string[]
  summary: LiveValidationSessionSummary | null
  limitations: string[]
}

export interface LiveValidationSessionFixture {
  id: string
  sessionId: string
  fixtureId: string
  providerFixtureId: string | null
  homeTeam: string
  awayTeam: string
  competition: string
  kickoffAt: string | null
  status: string
  includedAt: string
  coverageStatus: 'covered' | 'partial' | 'absent' | 'unknown'
  snapshotCount: number
  signalCount: number
  alertCount: number
  opportunityCount: number
  outcomeCount: number
  providerQuality: 'rich' | 'partial' | 'poor' | 'unknown'
  limitations: string[]
}

export type LiveValidationEventType =
  | 'session_started' | 'session_paused' | 'session_resumed' | 'session_completed' | 'session_cancelled'
  | 'fixture_attached' | 'fixture_skipped'
  | 'provider_budget_blocked' | 'snapshot_written' | 'snapshot_skipped'
  | 'signal_created' | 'alert_created' | 'auto_opportunity_created' | 'policy_evaluated'
  | 'outcome_resolved' | 'evidence_link_created'
  | 'provider_degraded' | 'data_quality_low' | 'worker_error' | 'guard_warning'

export interface LiveValidationSessionEvent {
  id: string
  sessionId: string
  fixtureId: string | null
  type: LiveValidationEventType
  source: string
  severity: 'info' | 'warning' | 'critical'
  message: string
  metadata: Record<string, unknown>
  createdAt: string
}

export interface LiveValidationSessionSummary {
  fixturesPlanned: number
  fixturesObserved: number
  fixturesSkipped: number
  snapshotsWritten: number
  snapshotsSkipped: number
  providerCallsAllowed: number
  providerCallsBlocked: number
  signalsCreated: number
  alertsCreated: number
  opportunitiesCreated: number
  outcomesResolved: number
  exactEvidenceLinks: number
  inferredEvidenceLinks: number
  unknownOutcomes: number
  notEvaluable: number
  dataQualityBreakdown: { rich: number; partial: number; poor: number; unknown: number }
  operationalRisk: 'low' | 'moderate' | 'high' | 'unsafe'
  recommendations: string[]
  limitations: string[]
  // ── B38: attribution + outcome QA breakdown ──
  exactSessionAttributionCount?: number
  inferredSessionGroupingCount?: number
  recordsWithoutSessionId?: number
  pendingOutcomes?: number
  attributionCoverageRate?: number | null
  outcomeBreakdown?: { confirmed: number; confirmed_partial: number; failed: number; unknown: number; expired: number; not_evaluable: number; pending: number }
  // ── B39: session record index + scoped metrics + dynamic attach ──
  recordLinkCoverageRate?: number | null
  indexedRecords?: number
  directSessionRecords?: number
  legacyInferredRecords?: number
  dynamicFixturesAttached?: number
  metricsSource?: 'session_counters' | 'fixture_window_fallback' | 'mixed'
  scopedProviderCallsAllowed?: number | null
  scopedProviderCallsBlocked?: number | null
  scopedSnapshotsWritten?: number | null
  scopedGuardBlocks?: number | null
}

export interface LiveValidationSessionReport {
  id: string
  sessionId: string
  generatedAt: string
  session: LiveValidationSession
  fixtures: LiveValidationSessionFixture[]
  events: LiveValidationSessionEvent[]
  summary: LiveValidationSessionSummary
  quality: { dataQualityBreakdown: { rich: number; partial: number; poor: number; unknown: number }; lowCoverageFixtures: string[] }
  evidence: { exact: number; inferred: number; unknown: number }
  operations: { providerCallsAllowed: number; providerCallsBlocked: number; snapshotsWritten: number; snapshotsSkipped: number; guardMode: string; profile: string }
  recommendations: string[]
  goNoGo: 'go' | 'go_with_limitations' | 'insufficient_data' | 'no_go'
  limitations: string[]
}

export interface CreateSessionInput {
  name: string
  description?: string | null
  fixtureScope?: LiveValidationFixtureScope
  goals?: LiveValidationGoal[]
  createdBy?: string | null
}
