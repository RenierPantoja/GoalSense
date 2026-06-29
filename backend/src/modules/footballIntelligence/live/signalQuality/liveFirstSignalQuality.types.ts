/**
 * Live-First Signal Quality Types — B68
 * ─────────────────────────────────────────────────────────────────────────────
 * Domain model for reviewing the QUALITY of ESPN live-first signals: evidence
 * strength, noise risk, outcome alignment, and a final quality grade. Observe
 * only — never applies calibration, never changes score/policy/thresholds.
 */

export type LiveFirstSignalKind =
  | 'score_shift'
  | 'late_goal'
  | 'red_card_shift'
  | 'pressure_shift'
  | 'possession_shift'
  | 'shots_shift'
  | 'dangerous_attack_shift'
  | 'timeline_event_cluster'
  | 'halftime_state'
  | 'fulltime_resolution'
  | 'stale_snapshot'
  | 'missing_context'
  | 'unknown'

export type LiveFirstSignalEvidenceStrength =
  | 'strong'
  | 'moderate'
  | 'weak'
  | 'insufficient'
  | 'unknown'

export type LiveFirstSignalNoiseRisk =
  | 'low'
  | 'medium'
  | 'high'
  | 'unknown'

export type LiveFirstSignalOutcomeAlignment =
  | 'aligned'
  | 'partially_aligned'
  | 'contradicted'
  | 'not_evaluable'
  | 'pending'
  | 'unknown'

export type LiveFirstSignalQualityGrade =
  | 'reliable_observe'
  | 'useful_but_limited'
  | 'noisy_monitor_only'
  | 'insufficient_data'
  | 'misleading_candidate'
  | 'pending_more_sample'

export interface LiveFirstSignalScoreState {
  home: number
  away: number
}

export interface LiveFirstSignalQualityCase {
  id: string
  fixtureId: string
  sessionId: string
  workerRunId?: string | null
  signalKind: LiveFirstSignalKind
  signalTimestamp: string
  matchMinute?: number | null
  scoreState?: LiveFirstSignalScoreState | null
  source: 'scoreboard' | 'timeline' | 'boxscore' | 'diff' | 'derived' | 'status' | 'unknown'
  evidenceStrength: LiveFirstSignalEvidenceStrength
  noiseRisk: LiveFirstSignalNoiseRisk
  outcomeAlignment: LiveFirstSignalOutcomeAlignment
  qualityGrade: LiveFirstSignalQualityGrade
  supportingEvidence: string[]
  missingEvidence: string[]
  limitations: string[]
  createdAt: string
}

export interface LiveFirstSignalQualitySummary {
  id: string
  generatedAt: string
  sampleSize: number
  signalsReviewed: number
  reliableObserve: number
  usefulButLimited: number
  noisyMonitorOnly: number
  insufficientData: number
  misleadingCandidate: number
  pendingMoreSample: number
  topUsefulSignals: Array<{ signalKind: LiveFirstSignalKind; count: number }>
  topNoisySignals: Array<{ signalKind: LiveFirstSignalKind; count: number }>
  momentumNoiseFindings: string[]
  governanceQualityFeedback: string[]
  recommendations: string[]
  limitations: string[]
}

// Momentum noise classification
export type MomentumNoiseCategory =
  | 'sustained_pressure'
  | 'event_driven_pressure'
  | 'score_effect_noise'
  | 'stale_snapshot_noise'
  | 'low_sample_noise'
  | 'normal_match_variance'
  | 'unknown'

export interface MomentumNoiseAssessment {
  category: MomentumNoiseCategory
  isLikelyNoise: boolean
  evidenceStrength: LiveFirstSignalEvidenceStrength
  reasons: string[]
  limitations: string[]
}

// Governance quality feedback (observe only)
export type GovernanceQualityFeedbackKind =
  | 'appropriate'
  | 'too_aggressive'
  | 'too_conservative'
  | 'insufficient_evidence'
  | 'data_limited'
  | 'pending_more_sample'

export interface GovernanceQualityFeedback {
  fixtureId: string
  feedback: GovernanceQualityFeedbackKind
  reasons: string[]
  recommendation: string
  limitations: string[]
}
