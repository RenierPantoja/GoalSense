/**
 * Evidence Lineage contracts (Phase B33).
 * ─────────────────────────────────────────────────────────────────────────────
 * Links real snapshots to the decisions they supported (alerts, outcomes,
 * backtests, replays, opportunities, policy evaluations, learning events).
 * HONEST semantics: `exact` only when a real snapshotId exists; inferred links
 * declare their method; `unknown` never authorizes a delete. Pure types.
 */

export type EvidenceLinkStrength =
  | 'exact'            // a real snapshotId is known and was used
  | 'strong_inferred'  // same fixture + same minute/capturedAt window, high confidence
  | 'window_inferred'  // same fixture + a time window (no exact id)
  | 'weak_inferred'    // same fixture only / heuristic
  | 'unknown'          // could not establish a link (never authorizes delete)

export type EvidenceLinkSource =
  | 'signal_ledger'
  | 'alert_outcome'
  | 'failure_analysis'
  | 'backtest_run'
  | 'backtest_result'
  | 'replay_run'
  | 'replay_step'
  | 'learning_event'
  | 'auto_opportunity'
  | 'auto_opportunity_outcome'
  | 'promoted_alert'
  | 'auto_alert_policy_evaluation'
  | 'manual_feedback'
  | 'retention_backfill'

export type EvidenceKind =
  | 'trigger_state'
  | 'pre_trigger_state'
  | 'post_trigger_state'
  | 'outcome_state'
  | 'replay_step'
  | 'backtest_evaluation'
  | 'learning_sample'
  | 'auto_opportunity_evidence'
  | 'policy_gate_evidence'
  | 'manual_review_evidence'
  | 'retention_protection'

export interface EvidenceSnapshotReference {
  id: string
  /** Real snapshot id when known; null when only fixture/window is known. */
  snapshotId: string | null
  fixtureId: string
  provider: string | null
  capturedAt: string | null
  minute: number | null
  linkStrength: EvidenceLinkStrength
  source: EvidenceLinkSource
  sourceId: string | null
  sourceType: string | null
  alertId: string | null
  patternId: string | null
  opportunityId: string | null
  backtestRunId: string | null
  replayRunId: string | null
  learningEventId: string | null
  outcomeId: string | null
  policyEvaluationId: string | null
  reason: string
  evidenceKind: EvidenceKind
  createdAt: string
  createdBy: string | null
  limitations: string[]
}

export interface EvidenceTimelineEntry {
  snapshotId: string | null
  capturedAt: string | null
  minute: number | null
  linkStrength: EvidenceLinkStrength
  source: EvidenceLinkSource
  evidenceKind: EvidenceKind
}

export interface EvidenceLineageBundle {
  fixtureId: string
  snapshotIds: string[]
  exactLinks: EvidenceSnapshotReference[]
  inferredLinks: EvidenceSnapshotReference[]
  unknownLinks: EvidenceSnapshotReference[]
  sources: EvidenceLinkSource[]
  timeline: EvidenceTimelineEntry[]
  protectionReasons: string[]
  limitations: string[]
}

/** Input for creating a single evidence link (id derived deterministically). */
export interface LinkSnapshotInput {
  snapshotId?: string | null
  fixtureId: string
  provider?: string | null
  capturedAt?: string | null
  minute?: number | null
  linkStrength: EvidenceLinkStrength
  source: EvidenceLinkSource
  sourceId?: string | null
  sourceType?: string | null
  alertId?: string | null
  patternId?: string | null
  opportunityId?: string | null
  backtestRunId?: string | null
  replayRunId?: string | null
  learningEventId?: string | null
  outcomeId?: string | null
  policyEvaluationId?: string | null
  reason: string
  evidenceKind: EvidenceKind
  createdBy?: string | null
  limitations?: string[]
}
