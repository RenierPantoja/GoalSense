/**
 * Live Validation Session Index — contracts (Phase B39).
 * ─────────────────────────────────────────────────────────────────────────────
 * Auxiliary session→record index, scoped metric counters, and dynamic fixture
 * attach runs. The index is NEVER the source of truth; legacy data falls back to
 * fixture/window grouping. `inferred` never pretends to be `exact`.
 */

export type LiveValidationRecordType =
  | 'snapshot' | 'signal_ledger' | 'alert' | 'outcome' | 'auto_opportunity'
  | 'policy_evaluation' | 'evidence_reference' | 'promoted_alert'
  | 'user_action' | 'feedback' | 'note'

export type AttributionStrength = 'exact_session_id' | 'inferred_fixture_window' | 'unknown'

export interface LiveValidationRecordLink {
  id: string
  validationSessionId: string
  sessionId: string
  sessionName: string | null
  recordType: LiveValidationRecordType
  recordId: string
  fixtureId: string | null
  providerFixtureId: string | null
  alertId: string | null
  opportunityId: string | null
  outcomeId: string | null
  policyEvaluationId: string | null
  evidenceReferenceId: string | null
  snapshotId: string | null
  createdAt: string
  source: string
  attributionStrength: AttributionStrength
  linkReason: string
  limitations: string[]
}

export interface LiveValidationSessionMetricCounter {
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

export type MetricKey = Exclude<keyof LiveValidationSessionMetricCounter, 'id' | 'validationSessionId' | 'bucket' | 'bucketKey' | 'updatedAt'>

export interface DynamicFixtureAttachRun {
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

export interface FixtureScopeMatch {
  fixtureId: string
  matched: boolean
  reasons: string[]
  scopeType: 'broad' | 'fixtureIds' | 'leagueNames' | 'teamNames' | 'none'
  confidence: 'exact' | 'strong' | 'weak' | 'unknown'
  limitations: string[]
}
