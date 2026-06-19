/**
 * Automatic Engine — canonical types (Phase B19).
 * ─────────────────────────────────────────────────────────────────────────────
 * The Auto Engine scans live fixtures and produces explainable, ranked
 * OPPORTUNITIES (not alerts). Deterministic, honest: no ML, no odds, no bets, no
 * promises. `unknown`/missing data is never a failure; `confirmed_partial` stays
 * partial usefulness; scores are signal-quality, NOT probabilities.
 */
import type { DataQuality, SampleQuality } from '../contracts/learning.types.js'

export type OpportunityType =
  | 'late_goal_pressure'
  | 'first_half_goal_pressure'
  | 'corners_pressure'
  | 'cards_pressure'
  | 'comeback_pressure'
  | 'dominant_home_pressure'
  | 'dominant_away_pressure'
  | 'pattern_similarity'
  | 'unknown'

export type OpportunityStatus = 'candidate' | 'watch' | 'strong' | 'blocked' | 'ignored'
export type ConfidenceBand = 'low' | 'medium' | 'high' | 'insufficient_data'

export type AutoSignalBlockReason =
  | 'auto_engine_disabled'
  | 'not_live'
  | 'data_poor'
  | 'provider_stale'
  | 'missing_required_data'
  | 'sample_quality_insufficient'
  | 'historically_weak'
  | 'recent_manual_alert'
  | 'duplicate_opportunity'
  | 'max_opportunities_per_fixture'
  | 'score_below_minimum'
  | 'too_much_unknown'
  | 'no_evidence'

export interface AutoSignalScore {
  baseScore: number
  liveContextScore: number
  patternLearningScore: number
  competitionScore: number
  teamContextScore: number
  minuteWindowScore: number
  dataQualityScore: number
  riskPenalty: number
  finalScore: number
  scoringNotes: string[]
}

export interface AutoSignalEvidence {
  liveStatsUsed: Record<string, number> | null
  minute: number | null
  scoreState: { home: number; away: number }
  recentOffensiveEvents: number
  passedSignals: string[]
  missingData: string[]
  dataQuality: DataQuality
  provider: string
}

export interface AutoSignalContextFit {
  competitionType: string | null
  importanceLabel: string | null
  minuteWindow: string
  matchedLearningContexts: string[]
  sampleQuality: SampleQuality
  source: 'observed' | 'heuristic' | 'limited'
  notes: string[]
}

export interface AutoSignalRiskGateResult {
  allowed: boolean
  blockReasons: AutoSignalBlockReason[]
  penalties: { reason: string; amount: number }[]
  warnings: string[]
  finalDecision: 'allow' | 'reduce' | 'block'
}

export interface AutoSignalExplanation {
  headline: string
  whyNow: string[]
  evidenceUsed: string[]
  historicalContext: string[]
  risks: string[]
  relatedPatternNote: string | null
}

export interface AutoOpportunity {
  id: string
  runId: string
  fixtureId: string
  fixtureLabel: string
  leagueName: string
  homeTeam: string
  awayTeam: string
  minute: number | null
  scoreState: { home: number; away: number }
  opportunityType: OpportunityType
  status: OpportunityStatus
  score: number
  confidenceBand: ConfidenceBand
  scoreBreakdown: AutoSignalScore
  evidence: AutoSignalEvidence
  contextFit: AutoSignalContextFit
  riskGate: AutoSignalRiskGateResult
  relatedPatternIds: string[]
  learningProfileRefs: string[]
  dataAvailability: Record<string, boolean>
  explanation: AutoSignalExplanation
  createdAt: string
  updatedAt: string
}

export interface AutoEngineRunConfig {
  maxFixtures: number
  minSampleQuality: SampleQuality
  minScore: number
  maxOppsPerFixture: number
  write: boolean
  dryRun: boolean
}

export interface AutoEngineRun {
  id: string
  startedAt: string
  finishedAt: string | null
  status: 'running' | 'completed' | 'failed' | 'skipped'
  enabled: boolean
  write: boolean
  config: AutoEngineRunConfig
  fixturesScanned: number
  opportunitiesFound: number
  strong: number
  watch: number
  candidate: number
  blocked: number
  blockReasons: Record<string, number>
  notes: string[]
}

export interface AutoEngineOverview {
  enabled: boolean
  writeEnabled: boolean
  schedulerEnabled: boolean
  toAlertsEnabled: boolean
  lastRun: AutoEngineRun | null
  opportunitiesTotal: number
  strong: number
  watch: number
  candidate: number
  blocked: number
  topOpportunityTypes: { type: string; count: number }[]
  dataQualityBreakdown: Record<string, number>
  blockReasons: Record<string, number>
  limitations: string[]
  latestOpportunities: AutoOpportunity[]
  generatedAt: string
}

// ─── B21: Opportunity Actions, Feedback, Notes, Promotion ────────────────────
// Human interaction with auto opportunities. Auditable, observational. NEVER
// creates an alert, alters a pattern, changes a score, or auto-tunes the engine.

export type AutoOpportunityActionType =
  | 'saved'
  | 'unsaved'
  | 'dismissed'
  | 'restored'
  | 'marked_useful'
  | 'marked_not_useful'
  | 'feedback_recorded'
  | 'note_added'
  | 'note_removed'
  | 'radar_proposal_created'
  | 'manual_alert_promoted'
  | 'opened_promoted_alert'
  | 'opened_in_backtest'
  | 'opened_related_alerts'
  | 'opened_fixture'
  | 'ignored_for_now'

export type AutoOpportunityFeedbackType =
  | 'useful'
  | 'not_useful'
  | 'too_early'
  | 'too_late'
  | 'data_poor'
  | 'context_wrong'
  | 'already_seen'
  | 'interesting_but_weak'
  | 'strong_signal'
  | 'irrelevant'
  | 'unknown'

export interface AutoOpportunityAction {
  id: string
  opportunityId: string
  fixtureId: string
  userId: string | null
  actionType: AutoOpportunityActionType
  feedbackType: AutoOpportunityFeedbackType | null
  note: string | null
  reason: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

export interface AutoOpportunityNote {
  note: string
  createdAt: string
}

/** Fast per-opportunity state for list badges (derived, deterministic id). */
export interface AutoOpportunityUserState {
  id: string
  opportunityId: string
  fixtureId: string
  saved: boolean
  dismissed: boolean
  lastFeedback: AutoOpportunityFeedbackType | null
  noteCount: number
  hasPromotionPlan: boolean
  /** B22: set when the opportunity was manually promoted to a monitored alert. */
  promotedAlertId: string | null
  updatedAt: string
}

export interface AutoOpportunityActionSummary {
  opportunityId: string
  totalActions: number
  saved: boolean
  dismissed: boolean
  lastFeedback: AutoOpportunityFeedbackType | null
  feedbackCounts: Record<string, number>
  noteCount: number
  notes: AutoOpportunityNote[]
  hasPromotionPlan: boolean
  /** B22: alertId of the monitored alert promoted from this opportunity, if any. */
  promotedAlertId: string | null
  lastActionAt: string | null
}

/** A suggested radar condition derived from real opportunity evidence. */
export interface SuggestedRadarCondition {
  type: string
  params: Record<string, number | string | boolean>
}

export interface AutoOpportunityPromotionPlan {
  id: string
  opportunityId: string
  fixtureId: string
  /** false when the opportunity has no evidence beyond is_live. */
  sufficient: boolean
  suggestedRadarName: string
  suggestedDescription: string
  suggestedScope: 'all' | 'favorites_only' | 'specific_leagues' | 'specific_teams' | 'specific_matches'
  suggestedEligibilityConditions: SuggestedRadarCondition[]
  suggestedSignalConditions: SuggestedRadarCondition[]
  suggestedAction: 'register_alert' | 'suggest_only' | 'highlight'
  suggestedConfidence: number
  sourceEvidence: string[]
  limitations: string[]
  createdAt: string
}

/** Read-only fixture context for "open match" / inspector enrichment. */
export interface AutoOpportunityFixtureContext {
  fixtureId: string
  found: boolean
  fixtureLabel: string | null
  homeTeam: string | null
  awayTeam: string | null
  league: string | null
  status: string | null
  minute: number | null
  score: { home: number; away: number } | null
  hasSnapshot: boolean
  snapshotAgeMs: number | null
  canOpenInCommandCenter: boolean
  limitations: string[]
}

// ─── B22: Manual promotion of an opportunity → monitored alert ───────────────
// Human-confirmed only. Never automatic. No Telegram, no odds, no bet. Provenance
// is mandatory; opportunity stays distinct from alert; score ≠ probability.

export interface PromotedAlertProvenance {
  source: 'auto_opportunity_manual'
  opportunityId: string
  autoEngineRunId: string | null
  opportunityType: OpportunityType
  originalScore: number
  originalConfidenceBand: ConfidenceBand
  promotedByUserId: string | null
  evidenceSnapshotRef: string | null
  riskGateSnapshot: AutoSignalRiskGateResult
  promotionNote: string | null
  promotedAt: string
}

/** Persistent opportunity → alert link (deterministic id `mpa_${opportunityId}`). */
export interface ManualPromotedAlertLink {
  id: string
  opportunityId: string
  fixtureId: string
  alertId: string
  ledgerId: string | null
  opportunityType: OpportunityType
  originalScore: number
  originalConfidenceBand: ConfidenceBand
  provenance: PromotedAlertProvenance
  promotedAt: string
}

export interface ManualAlertPromotionPreview {
  opportunityId: string
  fixtureId: string
  fixtureLabel: string
  opportunityType: OpportunityType
  proposedAlertTitle: string
  proposedAlertReason: string
  proposedSeverity: 'critical' | 'attention' | 'info'
  proposedConfidence: number
  evidence: string[]
  risks: string[]
  dataAvailability: Record<string, boolean>
  limitations: string[]
  canPromote: boolean
  blockedReasons: string[]
  duplicateCheck: { alreadyPromoted: boolean; alertId: string | null }
  requiredConfirmationText: string | null
  requiredAcknowledgements: string[]
}

export interface ManualAlertPromotionRequest {
  opportunityId: string
  userConfirmed: boolean
  confirmationMode: 'explicit_click' | 'typed_confirmation'
  note?: string | null
  acknowledgeNoTelegram: boolean
  acknowledgeNoOdds: boolean
  acknowledgeNotGuaranteed: boolean
}

export interface ManualAlertPromotionResult {
  success: boolean
  alertId: string | null
  ledgerId: string | null
  opportunityId: string
  created: boolean
  duplicate: boolean
  reason: string | null
  promotedAt: string | null
}

export interface PromotedAlertGuardResult {
  canPromote: boolean
  blockedReasons: string[]
  proposedSeverity: 'critical' | 'attention' | 'info'
  proposedConfidence: number
}
