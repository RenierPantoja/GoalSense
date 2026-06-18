/**
 * Learning Aggregator — canonical types (Phase B13).
 * ─────────────────────────────────────────────────────────────────────────────
 * Deterministic, honest aggregation contracts. No ML, no auto-tuning, no
 * promises of accuracy. Rates are computed over RESOLVED alerts only; `unknown`
 * is never a failure; `confirmed_partial` counts as partial usefulness.
 */
import type { AlertResult, DataQuality, Confidence } from './intelligence.types.js'

export type MinuteWindow =
  | 'pre_match' | '0_15' | '16_30' | '31_45' | '46_60'
  | '61_70' | '71_80' | '81_90' | 'stoppage' | 'unknown'

export type SampleQuality = 'insufficient' | 'low' | 'moderate' | 'strong'

export type LearningScopeType =
  | 'pattern' | 'competition' | 'team' | 'team_home' | 'team_away'
  | 'minute_window' | 'context'

/** Counts of each alert result inside a context bucket. */
export interface OutcomeDistribution {
  total: number
  pending: number
  confirmed: number
  confirmedPartial: number
  failed: number
  unknown: number
  expired: number
}

/** Per-data-quality slice of outcomes. */
export type DataQualityBreakdown = Record<DataQuality, OutcomeDistribution>

/** A small named sub-bucket used for "best/worst contexts" lists. */
export interface ContextBreakdownSample {
  contextKey: string
  label: string
  sampleSize: number
  usefulRate: number | null
  failedRate: number | null
  unknownRate: number | null
  sampleQuality: SampleQuality
}

/** Common aggregate shared by every learning profile. */
export interface LearningStatsBase {
  id: string
  scopeType: LearningScopeType
  scopeKey: string
  label: string
  sampleSize: number
  resolvedCount: number
  usefulCount: number
  confirmedCount: number
  confirmedPartialCount: number
  failedCount: number
  unknownCount: number
  pendingCount: number
  expiredCount: number
  usefulRate: number | null
  failedRate: number | null
  unknownRate: number | null
  avgConfidenceAtSignal: number | null
  avgTimeToResolutionMinutes: number | null
  dataQualityBreakdown: DataQualityBreakdown
  sampleQuality: SampleQuality
  /** `heuristic` when the dimension is derived (e.g. competition type). */
  source: 'observed' | 'heuristic'
  lastUpdatedAt: string
}

export interface SignalContextStats extends LearningStatsBase {
  scopeType: 'context'
}

export interface PatternLearningProfile extends LearningStatsBase {
  scopeType: 'pattern'
  radarName: string
  bestCompetitions: ContextBreakdownSample[]
  worstCompetitions: ContextBreakdownSample[]
  bestMinuteWindows: ContextBreakdownSample[]
  worstMinuteWindows: ContextBreakdownSample[]
  topFailureReasons: { reason: string; count: number }[]
}

export interface CompetitionLearningProfile extends LearningStatsBase {
  scopeType: 'competition'
  competitionType: string | null
  mostUsefulPatterns: ContextBreakdownSample[]
  mostFailingPatterns: ContextBreakdownSample[]
  strongMinuteWindows: ContextBreakdownSample[]
}

export interface TeamLearningProfile extends LearningStatsBase {
  scopeType: 'team'
  home: OutcomeDistribution
  away: OutcomeDistribution
  homeUsefulRate: number | null
  awayUsefulRate: number | null
  topFailureReasons: { reason: string; count: number }[]
}

export interface MinuteWindowLearningProfile extends LearningStatsBase {
  scopeType: 'minute_window'
  window: MinuteWindow
}

// ─── Aggregation run + recommendations ─────────────────────────────────────────

export interface LearningAggregationRun {
  id: string
  startedAt: string
  finishedAt: string | null
  status: 'running' | 'completed' | 'failed'
  ledgerEntriesScanned: number
  outcomesScanned: number
  failuresScanned: number
  patternProfiles: number
  competitionProfiles: number
  teamProfiles: number
  contextStats: number
  recommendations: number
  learningEventsCreated: number
  dryRun: boolean
  notes: string[]
}

export type LearningRecommendationType =
  | 'exclude_context_candidate'
  | 'adjust_minute_window_candidate'
  | 'adjust_threshold_candidate'
  | 'data_quality_warning'
  | 'competition_strength_observed'
  | 'team_context_strength_observed'
  | 'insufficient_sample'
  | 'high_unknown_rate'

export interface LearningRecommendation {
  id: string
  type: LearningRecommendationType
  scopeType: LearningScopeType
  scopeKey: string
  patternId: string | null
  message: string
  strength: Confidence
  evidence: {
    sampleSize: number
    context: string
    distribution: OutcomeDistribution
    sampleQuality: SampleQuality
  }
  createdAt: string
}

// ─── Overview for the future "Aprendizados" UI ─────────────────────────────────

export interface LearningOverview {
  totalAlertsTracked: number
  resolvedAlerts: number
  pendingAlerts: number
  usefulSignals: number
  failedSignals: number
  unknownSignals: number
  topPatternsByUsefulRate: ContextBreakdownSample[]
  highUnknownContexts: ContextBreakdownSample[]
  mostCommonFailureReasons: { reason: string; count: number }[]
  recentLearningEvents: Array<{ id: string; type: string; message: string; createdAt: string }>
  latestAggregationRun: LearningAggregationRun | null
  generatedAt: string
}

// Re-export for convenience.
export type { AlertResult, DataQuality }
