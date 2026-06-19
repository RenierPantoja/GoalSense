/**
 * Football Intelligence Memory — canonical types (Phase B12).
 * ─────────────────────────────────────────────────────────────────────────────
 * Professional contract for the data the engine has TODAY and the data it will
 * have in future phases (rich pre-match, H2H, standings, lineups, odds).
 *
 * Hard rules encoded in the shapes:
 *   - Every forward-looking field accepts `unknown`/`null`.
 *   - Derived values carry `source` + `confidence`.
 *   - Absent data carries a `DataAvailability` with an `unavailableReason`.
 *   - `0` is a real value; absence is `null` + `unavailable`. They are distinct.
 */

// ─── Data availability discipline ──────────────────────────────────────────────

export type DataQuality = 'rich' | 'partial' | 'poor' | 'unknown'

export type UnavailableReason =
  | 'provider_not_supported'
  | 'not_collected_yet'
  | 'not_available_for_league'
  | 'missing_mapping'
  | 'unknown'

export interface DataAvailability {
  available: boolean
  source: string | null
  quality: DataQuality
  /** Present only when `available === false`. */
  unavailableReason?: UnavailableReason
}

/** Per-field availability map (e.g. { stats: ..., events: ..., h2h: ... }). */
export type DataAvailabilityMap = Record<string, DataAvailability>

export type Confidence = 'low' | 'medium' | 'high'

// ─── Canonical contexts (current + future-ready, mostly unknown today) ─────────

export interface CanonicalCompetitionContext {
  name: string
  competitionType: 'league' | 'cup' | 'continental' | 'national_team' | 'friendly' | 'unknown'
  stage: string
  isKnockout: boolean
  importance: number
  importanceLabel: 'baixa' | 'média' | 'alta' | 'decisiva'
  /** Derivation provenance — heuristic from the competition name today. */
  source: string
  availability: DataAvailability
}

export interface CanonicalTeamContext {
  name: string
  side: 'home' | 'away'
  /** All future-rich: recent form, rank, injuries, etc. — null/unknown today. */
  recentForm: string | null
  leaguePosition: number | null
  availability: DataAvailability
}

export interface CanonicalPreMatchContext {
  /** Pre-match data (form, H2H, lineups, injuries, suspensions) is not collected yet. */
  headToHead: unknown | null
  homeForm: string | null
  awayForm: string | null
  lineupsKnown: boolean
  availability: DataAvailability
}

export interface CanonicalLiveContext {
  minute: number | null
  status: string
  score: { home: number; away: number }
  penaltyScore: { home: number; away: number } | null
  dataQuality: DataQuality
  provider: string
  availability: DataAvailability
}

export interface CanonicalMatchContext {
  fixtureId: string
  canonicalKey: string
  fixtureLabel: string
  homeTeam: string
  awayTeam: string
  competition: CanonicalCompetitionContext
  live: CanonicalLiveContext
  preMatch: CanonicalPreMatchContext
  home: CanonicalTeamContext
  away: CanonicalTeamContext
}

// ─── Signal lifecycle ──────────────────────────────────────────────────────────

export type SignalStatus = 'candidate' | 'blocked' | 'alerted' | 'resolved' | 'missed' | 'ignored'

export interface SignalLedgerEntry {
  id: string
  alertId: string | null
  patternId: string | null
  userId: string
  radarName: string
  fixtureId: string
  fixtureLabel: string
  leagueName: string
  homeTeam: string
  awayTeam: string
  minute: number | null
  scoreState: { home: number; away: number }
  signalStatus: SignalStatus
  signalType: string
  confidenceAtSignal: number | null
  severity: string
  /** Reference to the evidence snapshot (embedded for convenience). */
  evidence: SignalEvidenceSnapshot | null
  scopeDecision: { reason: string } | null
  matchContext: {
    competitionType: string
    stage: string
    isKnockout: boolean
    importance: number
    importanceLabel: string
  } | null
  dataAvailability: DataAvailabilityMap
  createdAt: string
  updatedAt: string
  // ── B23 (optional): outcome layer for resolved signals (esp. promoted alerts) ──
  /** Terminal outcome when the signal was resolved (mirror of AlertOutcomeRecord.result). */
  outcomeResult?: AlertResult
  outcomeReason?: string
  /** Where the resolution came from. `promoted_alert_resolution` for B22→B23 alerts. */
  resolutionSource?: 'alert_resolution' | 'promoted_alert_resolution'
  resolvedAt?: string | null
  dataQualityAtResolution?: DataQuality
  missingDataAtResolution?: string[]
}

export interface SignalEvidenceSnapshot {
  evaluatedConditions: string[]
  passedConditions: string[]
  failedConditions: string[]
  signalConditions: string[]
  eligibilityConditions: string[]
  blockers: string[]
  confidenceBreakdown: Record<string, number> | null
  liveStatsUsed: Record<string, number> | null
  scoreState: { home: number; away: number }
  minuteState: number | null
  recentEvents: Array<{ minute: number; type: string; side?: string }> | null
  scopeReason: string | null
  matchContextReason: string | null
  providerQuality: DataQuality
  missingData: string[]
}

// ─── Alert outcome ─────────────────────────────────────────────────────────────

export type AlertResult = 'pending' | 'confirmed' | 'confirmed_partial' | 'failed' | 'unknown' | 'expired'

export interface AlertOutcomeRecord {
  id: string
  alertId: string
  fixtureId: string
  patternId: string | null
  result: AlertResult
  resolutionType: string | null
  resolutionMinute: number | null
  timeToResolutionMinutes: number | null
  outcomeReason: string
  whatConfirmed: string[]
  whatFailed: string[]
  missingForConfirmation: string[]
  dataQualityAtResolution: DataQuality
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
}

// ─── Failure analysis (deterministic, honest — no fake causality) ──────────────

export type FailureReason =
  | 'data_poor'
  | 'provider_stale'
  | 'threshold_too_strict_possible'
  | 'threshold_too_loose_possible'
  | 'weak_momentum'
  | 'bad_competition_context'
  | 'alert_too_early'
  | 'alert_too_late'
  | 'missing_required_data'
  | 'random_outcome_possible'
  | 'unknown'

export interface SignalFailureAnalysis {
  id: string
  alertId: string
  fixtureId: string
  patternId: string | null
  failureReason: FailureReason
  contributingFactors: string[]
  suggestedReview: string | null
  confidenceInDiagnosis: Confidence
  createdAt: string
}

// ─── Missed opportunity (conservative; better none than false) ─────────────────

export interface MissedOpportunityRecord {
  id: string
  fixtureId: string
  patternId: string | null
  eventType: string
  eventMinute: number | null
  almostMatchedConditions: string[]
  missingConditions: string[]
  suggestedReview: string | null
  dataAvailability: DataAvailabilityMap
  createdAt: string
}

// ─── Learning events (observations only — never auto-tune anything yet) ────────

export type LearningEventType =
  | 'alert_created'
  | 'alert_confirmed'
  | 'alert_failed'
  | 'alert_unknown'
  | 'alert_confirmed_partial'
  | 'pattern_context_observation'
  | 'provider_data_gap'
  | 'possible_threshold_issue'
  | 'scope_effect_observed'
  | 'competition_context_observed'
  // B21 — observational events from human feedback on auto opportunities.
  // These are NEVER counted as statistical truth and NEVER auto-tune anything.
  | 'auto_opportunity_saved'
  | 'auto_opportunity_dismissed'
  | 'auto_opportunity_marked_useful'
  | 'auto_opportunity_marked_not_useful'
  | 'auto_opportunity_radar_proposal_created'
  | 'auto_opportunity_promoted_to_alert'
  // B23 — observational outcomes of a manually-promoted alert's honest resolution.
  // source = 'promoted_alert_resolution'. NEVER auto-tunes; unknown ≠ failed.
  | 'auto_opportunity_promoted_alert_confirmed'
  | 'auto_opportunity_promoted_alert_partial'
  | 'auto_opportunity_promoted_alert_failed'
  | 'auto_opportunity_promoted_alert_unknown'
  | 'auto_opportunity_promoted_alert_resolution_limited'
  // B24 — observational Auto Engine calibration events. source = 'auto_engine_calibration'.
  // NEVER auto-tunes the engine; sampleSize/evidence required; unknown ≠ failure.
  | 'auto_engine_calibration_rebuilt'
  | 'auto_engine_opportunity_type_positive_signal'
  | 'auto_engine_opportunity_type_high_unknown'
  | 'auto_engine_score_bucket_insufficient_sample'
  | 'auto_engine_data_quality_limitation'
  | 'auto_engine_risk_gate_observation'

export interface LearningEvent {
  id: string
  type: LearningEventType
  fixtureId: string | null
  alertId: string | null
  patternId: string | null
  contextKey: string
  message: string
  evidenceRef: string | null
  confidence: Confidence
  /** B21/B22: provenance of human-originated, non-statistical observations. */
  source?: 'system' | 'user_feedback' | 'user_action' | 'promoted_alert_resolution' | 'auto_engine_calibration'
  createdAt: string
}

// ─── Overview (read API aggregate) ─────────────────────────────────────────────

export interface IntelligenceOverview {
  ledgerEntries: number
  outcomes: number
  outcomeBreakdown: Record<AlertResult, number>
  failureAnalyses: number
  learningEvents: number
  missedOpportunities: number
  generatedAt: string
}
