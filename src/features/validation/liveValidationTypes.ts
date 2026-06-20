/**
 * Live Validation Sessions — frontend types (Phase B37).
 */
export type LiveValidationSessionStatus =
  | 'draft' | 'ready' | 'running' | 'paused' | 'completed' | 'cancelled' | 'failed_non_fatal'

export interface LiveValidationFixtureScopeDto {
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
  | 'validateProviderCoverage' | 'validateSnapshots' | 'validateAlerts' | 'validateAutoEngine'
  | 'validateBacktestReplay' | 'validateEvidenceLineage' | 'validateOperationalCost'

export interface LiveValidationSessionSummaryDto {
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
  exactSessionAttributionCount?: number
  inferredSessionGroupingCount?: number
  recordsWithoutSessionId?: number
  pendingOutcomes?: number
  attributionCoverageRate?: number | null
  outcomeBreakdown?: { confirmed: number; confirmed_partial: number; failed: number; unknown: number; expired: number; not_evaluable: number; pending: number }
  // ── B39: record index + scoped metrics + dynamic attach ──
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

export interface LiveValidationRecordLinkDto {
  id: string
  validationSessionId: string
  sessionName: string | null
  recordType: string
  recordId: string
  fixtureId: string | null
  alertId: string | null
  opportunityId: string | null
  outcomeId: string | null
  policyEvaluationId: string | null
  evidenceReferenceId: string | null
  snapshotId: string | null
  createdAt: string
  source: string
  attributionStrength: 'exact_session_id' | 'inferred_fixture_window' | 'unknown'
  linkReason: string
  limitations: string[]
}

export interface RecordLinkCoverageDto {
  totalLinks: number
  byType: Record<string, number>
  exact: number
  inferred: number
  unknown: number
}

export interface LiveValidationRecordLinksResponseDto {
  links: LiveValidationRecordLinkDto[]
  coverage: RecordLinkCoverageDto | null
}

export interface LiveValidationSessionMetricCounterDto {
  id: string
  validationSessionId: string
  bucket: 'total' | 'minute' | 'hour'
  bucketKey: string
  providerCallsAllowed: number
  providerCallsBlocked: number
  snapshotsWritten: number
  snapshotsSkipped: number
  fixtureCapSkipped: number
  guardBlocks: number
  signalsCreated: number
  alertsCreated: number
  opportunitiesCreated: number
  policyEvaluations: number
  outcomesResolved: number
  evidenceExactLinks: number
  evidenceInferredLinks: number
  unknownOutcomes: number
  notEvaluableOutcomes: number
  pendingOutcomes: number
  updatedAt: string
}

export interface FixtureScopeMatchDto {
  fixtureId: string
  matched: boolean
  reasons: string[]
  scopeType: 'broad' | 'fixtureIds' | 'leagueNames' | 'teamNames' | 'none'
  confidence: 'exact' | 'strong' | 'weak' | 'unknown'
  limitations: string[]
}

export interface DynamicFixtureAttachRunDto {
  id: string
  validationSessionId: string
  startedAt: string
  completedAt: string | null
  scannedFixtures: number
  matchedFixtures: number
  attachedFixtures: number
  skippedFixtures: number
  providerCallsBlocked: number
  limitations: string[]
  status: 'completed' | 'completed_with_limitations' | 'failed_non_fatal'
}

export interface LiveValidationLinkedRecordDto {
  id: string
  fixtureId: string
  label: string
  attributionStrength: 'exact_session_id' | 'inferred_fixture_window' | 'unknown'
  detail: string
  result?: string
}

export interface LiveValidationLinkedRecordsDto {
  alerts: LiveValidationLinkedRecordDto[]
  opportunities: LiveValidationLinkedRecordDto[]
  evidence: LiveValidationLinkedRecordDto[]
  outcomes: LiveValidationLinkedRecordDto[]
  outcomeBreakdown: Record<string, number>
}

export interface LiveValidationSessionDto {
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
  fixtureScope: LiveValidationFixtureScopeDto
  goals: LiveValidationGoal[]
  notes: string[]
  summary: LiveValidationSessionSummaryDto | null
  limitations: string[]
}

export interface LiveValidationSessionFixtureDto {
  id: string
  sessionId: string
  fixtureId: string
  homeTeam: string
  awayTeam: string
  competition: string
  kickoffAt: string | null
  status: string
  coverageStatus: 'covered' | 'partial' | 'absent' | 'unknown'
  snapshotCount: number
  signalCount: number
  alertCount: number
  opportunityCount: number
  outcomeCount: number
  providerQuality: 'rich' | 'partial' | 'poor' | 'unknown'
  limitations: string[]
}

export interface LiveValidationSessionEventDto {
  id: string
  sessionId: string
  fixtureId: string | null
  type: string
  source: string
  severity: 'info' | 'warning' | 'critical'
  message: string
  metadata: Record<string, unknown>
  createdAt: string
}

export interface LiveValidationSessionReportDto {
  id: string
  sessionId: string
  generatedAt: string
  session: LiveValidationSessionDto
  fixtures: LiveValidationSessionFixtureDto[]
  events: LiveValidationSessionEventDto[]
  summary: LiveValidationSessionSummaryDto
  quality: { dataQualityBreakdown: { rich: number; partial: number; poor: number; unknown: number }; lowCoverageFixtures: string[] }
  evidence: { exact: number; inferred: number; unknown: number }
  operations: { providerCallsAllowed: number; providerCallsBlocked: number; snapshotsWritten: number; snapshotsSkipped: number; guardMode: string; profile: string }
  recommendations: string[]
  goNoGo: 'go' | 'go_with_limitations' | 'insufficient_data' | 'no_go'
  limitations: string[]
}

export const STATUS_TONE: Record<LiveValidationSessionStatus, string> = {
  draft: 'bg-white/[0.05] border-white/[0.1] text-white/55',
  ready: 'bg-sky-500/10 border-sky-400/20 text-sky-200/85',
  running: 'bg-[#13B8A6]/12 border-[#2DD4BF]/25 text-[#7FE9DC]',
  paused: 'bg-amber-500/8 border-amber-400/15 text-amber-100/75',
  completed: 'bg-emerald-500/10 border-emerald-400/20 text-emerald-200/85',
  cancelled: 'bg-white/[0.04] border-white/[0.08] text-white/45',
  failed_non_fatal: 'bg-rose-500/10 border-rose-400/25 text-rose-200/85',
}
export const STATUS_LABEL: Record<LiveValidationSessionStatus, string> = {
  draft: 'Rascunho', ready: 'Pronta', running: 'Rodando', paused: 'Pausada',
  completed: 'Concluída', cancelled: 'Cancelada', failed_non_fatal: 'Falha (não fatal)',
}
export const GONOGO_LABEL: Record<string, string> = {
  go: 'GO', go_with_limitations: 'GO (com limitações)', insufficient_data: 'Dados insuficientes', no_go: 'NO-GO',
}
