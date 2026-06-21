/**
 * Post-Match Causal Learning — Contracts (B48 / Bloco 5).
 * ─────────────────────────────────────────────────────────────────────────────
 * Connects decisions (governance/influence/memory/data) to outcomes to understand
 * WHY a decision worked, failed, should have waited or stayed out — producing
 * conservative, human-review-only refinement suggestions. Inviolable rules encoded:
 *   - causal classification is NOT a probability and NOT a promise of being right;
 *   - an error is not "chance" without evidence; success is not genius by default;
 *   - variance/shock only with evidence; provider/data gaps separated from bad analysis;
 *   - a weak link never becomes strong causality; unknown/not_evaluable are never failed;
 *   - suggestions NEVER auto-apply (`autoApplicable=false`, `requiresHumanReview=true`).
 */

export type CausalOutcomeClassification =
  | 'good_decision_good_outcome' | 'good_decision_bad_outcome' | 'bad_decision_good_outcome'
  | 'bad_decision_bad_outcome' | 'right_to_wait' | 'should_have_waited' | 'right_to_stay_out'
  | 'should_have_stayed_out' | 'too_early' | 'too_late' | 'overconservative' | 'too_loose'
  | 'provider_limited' | 'data_insufficient' | 'variance_or_shock' | 'not_evaluable' | 'unknown'

export type CausalFailureCategory =
  | 'ignored_blocker' | 'ignored_wait_reason' | 'missing_critical_domain' | 'stale_data'
  | 'weak_sample_overweighted' | 'memory_misleading' | 'influence_overestimated'
  | 'influence_underestimated' | 'lineup_changed' | 'key_absence_missed' | 'red_card_shock'
  | 'substitution_shift' | 'tactical_shift' | 'provider_limitation' | 'manual_data_conflict'
  | 'pattern_context_mismatch' | 'governance_too_loose' | 'governance_too_strict'
  | 'true_variance' | 'unknown'

export type CausalSuccessCategory =
  | 'fundamentals_aligned' | 'influence_aligned' | 'memory_aligned' | 'governance_waited_correctly'
  | 'governance_blocked_correctly' | 'live_confirmation_worked' | 'critical_domain_supported'
  | 'lineup_supported' | 'context_supported' | 'pattern_context_strong'
  | 'conservative_policy_helped' | 'unknown'

export type CausalCaseSource =
  | 'alert' | 'auto_opportunity' | 'promoted_opportunity' | 'governance_hold'
  | 'live_recheck' | 'backtest' | 'manual_review'

export type DecisionLinkStrength =
  | 'exact' | 'strong_contextual' | 'temporal_contextual' | 'weak_contextual' | 'unknown'

export interface DecisionTimelineEvent {
  timestamp: string
  eventType:
    | 'pre_match_package' | 'influence_built' | 'governance_decision' | 'hold_created'
    | 'hold_rechecked' | 'live_trigger' | 'assumption_invalidated' | 'alert_created'
    | 'outcome_resolved' | 'post_match'
  summary: string
  refs: string[]
  limitations: string[]
}

export interface DecisionOutcomeLink {
  id: string
  fixtureId: string
  patternId: string | null
  governanceResultId: string | null
  alertId: string | null
  outcomeId: string | null
  signalLedgerId: string | null
  opportunityId: string | null
  linkStrength: DecisionLinkStrength
  linkReasons: string[]
  ambiguous: boolean
  limitations: string[]
  createdAt: string
}

export interface CausalLearningCase {
  id: string
  fixtureId: string
  patternId: string | null
  alertId: string | null
  candidateAlertId: string | null
  opportunityId: string | null
  governanceResultId: string | null
  influenceLedgerId: string | null
  signalLedgerId: string | null
  outcomeId: string | null
  source: CausalCaseSource
  createdAt: string
  evaluatedAt: string | null
  outcomeResult: string | null
  governanceAction: string | null
  linkStrength: DecisionLinkStrength
  classification: CausalOutcomeClassification
  successCategories: CausalSuccessCategory[]
  failureCategories: CausalFailureCategory[]
  decisionTimeline: DecisionTimelineEvent[]
  evidenceRefs: string[]
  dataQuality: 'rich' | 'partial' | 'poor' | 'unavailable' | 'unknown'
  evaluable: boolean
  limitations: string[]
}

export interface CausalLearningInsight {
  id: string
  fixtureId: string | null
  patternId: string | null
  caseId: string | null
  insightType:
    | 'governance_policy' | 'variable_influence' | 'memory' | 'data_acquisition'
    | 'live_recheck' | 'alert_timing' | 'provider_quality' | 'manual_review'
  severity: 'info' | 'caution' | 'important' | 'critical'
  title: string
  explanation: string
  evidence: string[]
  suggestedRefinement: string | null
  autoApplicable: false
  requiresHumanReview: true
  createdAt: string
  limitations: string[]
}

export type CalibrationConfidence = 'high' | 'medium' | 'low' | 'insufficient' | 'unknown'
export type CalibrationReviewStatus = 'pending' | 'reviewed' | 'rejected' | 'accepted_for_future'

export interface GovernanceCalibrationSuggestion {
  id: string
  policyArea: string
  currentBehavior: string
  observedIssue: string
  suggestedChange: string
  evidenceCount: number
  sampleQuality: string
  confidenceOfSuggestion: CalibrationConfidence
  risk: 'low' | 'medium' | 'high'
  autoApplyAllowed: false
  reviewStatus: CalibrationReviewStatus
  createdAt: string
  reviewedAt: string | null
  reviewedBy: string | null
  limitations: string[]
}

export interface VariableInfluenceCalibrationSuggestion {
  id: string
  variableKey: string
  patternFamily: string
  issue: 'overestimated' | 'underestimated' | 'wrong_direction' | 'should_block'
    | 'should_wait' | 'should_require_live_confirmation' | 'weak_sample'
  suggestedMagnitudeChange: string
  evidenceCount: number
  sampleQuality: string
  confidenceOfSuggestion: CalibrationConfidence
  autoApplyAllowed: false
  reviewStatus: CalibrationReviewStatus
  createdAt: string
  reviewedAt: string | null
  reviewedBy: string | null
  limitations: string[]
}

export interface CausalLearningRun {
  id: string
  scope: 'fixture' | 'today' | 'pattern' | 'governance_result' | 'alert'
  fixtureIds: string[]
  startedAt: string
  completedAt: string | null
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  casesAnalyzed: number
  insightsCreated: number
  suggestionsCreated: number
  notEvaluableCount: number
  notes: string[]
  error: string | null
  limitations: string[]
}
