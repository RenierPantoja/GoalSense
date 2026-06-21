/**
 * Alert Decision Governance — Contracts (B47 / Bloco 4).
 * ─────────────────────────────────────────────────────────────────────────────
 * The single, auditable decision door that consults readiness/memory/influence/
 * critical-domain to decide allow/monitor/wait/block/stay_out. Inviolable rules:
 *   - a decision is NOT a probability and NOT a promise of being right;
 *   - default mode is observe/shadow → it NEVER blocks a real alert;
 *   - `actuallyBlocked` can be true ONLY under explicit enforce;
 *   - a hold is not a failure; it is "wait and re-evaluate";
 *   - conflicts are never resolved silently; overrides are always audited.
 */

export type AlertGovernanceMode = 'observe' | 'shadow' | 'shadow_block' | 'enforce'

export type AlertDecisionAction =
  | 'allow_alert' | 'allow_monitor_only' | 'wait_for_lineup' | 'wait_for_domain_fetch'
  | 'wait_for_mapping' | 'wait_for_manual_review' | 'wait_for_live_confirmation'
  | 'downgrade_to_monitor' | 'block_alert' | 'stay_out' | 'post_match_learning_only' | 'no_decision'

export type AlertDecisionSeverity = 'informational' | 'caution' | 'strong_caution' | 'blocking' | 'critical'

export type AlertDecisionSource =
  | 'command_pattern' | 'auto_engine_opportunity' | 'promoted_opportunity' | 'manual_review'
  | 'live_recheck' | 'post_lineup_recheck' | 'domain_refresh_recheck' | 'governance_replay' | 'unknown'

export type AlertGovernanceRecheckTrigger =
  | 'lineup_confirmed' | 'lineup_changed' | 'domain_refreshed' | 'manual_record_created'
  | 'mapping_confirmed' | 'red_card' | 'goal' | 'substitution' | 'injury_event'
  | 'half_time' | 'minute_threshold' | 'match_status_changed' | 'post_match_completed'

export interface AlertDecisionGovernanceInput {
  fixtureId: string
  patternId?: string | null
  candidateAlertId?: string | null
  opportunityId?: string | null
  source: AlertDecisionSource
  currentMinute?: number | null
  matchStatus?: string | null
  packageVersion?: string
  existingSignalLedgerId?: string | null
  requestedAction?: AlertDecisionAction
  metadata?: Record<string, unknown>
}

export interface AlertDecisionGovernanceResult {
  id: string
  fixtureId: string
  patternId: string | null
  candidateAlertId: string | null
  opportunityId: string | null
  mode: AlertGovernanceMode
  source: AlertDecisionSource
  action: AlertDecisionAction
  severity: AlertDecisionSeverity
  generatedAt: string
  readinessStatus: string | null
  precheckDecision: string | null
  influenceBand: string | null
  influenceScore: number | null
  confidenceOfAssessment: string | null
  blockers: string[]
  waitReasons: string[]
  stayOutReasons: string[]
  monitorReasons: string[]
  allowReasons: string[]
  liveConfirmationReasons: string[]
  missingCriticalDomains: string[]
  conflicts: string[]
  evidenceRefs: string[]
  decisionInputRefs: string[]
  wouldHaveBlocked: boolean
  wouldHaveAllowed: boolean
  actuallyBlocked: boolean
  actuallyAllowed: boolean
  actuallyDowngraded: boolean
  limitations: string[]
}

export type AlertGovernanceHoldReason =
  | 'lineup_pending' | 'domain_pending' | 'mapping_pending' | 'manual_review_pending'
  | 'live_confirmation_pending' | 'conflict_pending'

export type AlertGovernanceHoldStatus = 'active' | 'resolved' | 'expired' | 'cancelled'

export interface AlertGovernanceHold {
  id: string
  fixtureId: string
  patternId: string | null
  source: AlertDecisionSource
  reason: AlertGovernanceHoldReason
  createdAt: string
  expiresAt: string
  status: AlertGovernanceHoldStatus
  lastEvaluationId: string | null
  nextRecommendedCheckAt: string | null
  evidenceRefs: string[]
  limitations: string[]
}

export interface AssumptionInvalidation {
  id: string
  fixtureId: string
  patternId: string | null
  governanceResultId: string | null
  invalidatedAssumption: string
  trigger: AlertGovernanceRecheckTrigger
  severity: AlertDecisionSeverity
  recommendedAction: 'recheck' | 'downgrade' | 'cancel_hold' | 'stay_out' | 'live_confirmation' | 'post_match_only'
  reason: string
  evidenceRefs: string[]
  createdAt: string
}

export interface AlertGovernanceOverride {
  overrideBy: string | null
  overrideAt: string
  originalGovernanceAction: AlertDecisionAction
  overrideReason: string | null
  acknowledgement: {
    noGuarantee: boolean
    noTelegram: boolean
    noOdds: boolean
    manualResponsibility: boolean
  }
}

export interface AlertGovernanceRun {
  id: string
  scope: 'fixture' | 'live_trigger' | 'hold_recheck' | 'expire'
  fixtureId: string | null
  trigger: AlertGovernanceRecheckTrigger | null
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  startedAt: string
  finishedAt: string | null
  resultsCreated: number
  holdsCreated: number
  holdsResolved: number
  invalidationsCreated: number
  notes: string[]
  error: string | null
}
