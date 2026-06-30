/**
 * Signal Quality Campaign Types — B70
 * ─────────────────────────────────────────────────────────────────────────────
 * Multi-window live-first signal quality campaign: accumulates sample across real
 * windows, tracks a human-review queue, and assesses threshold-study readiness.
 * Observe only — no calibration, no policy/threshold/score change.
 */
import type {
  LiveFirstSignalKind,
  LiveFirstSignalEvidenceStrength,
  LiveFirstSignalNoiseRisk,
  LiveFirstSignalOutcomeAlignment,
  LiveFirstSignalQualityGrade,
} from './liveFirstSignalQuality.types.js'

export type SignalQualityCampaignStatus =
  | 'planned'
  | 'running'
  | 'paused'
  | 'completed'
  | 'completed_with_warnings'
  | 'failed'

export type SignalQualityCampaignWindowStatus =
  | 'planned'
  | 'running'
  | 'completed'
  | 'skipped_no_live_fixtures'
  | 'completed_with_warnings'
  | 'failed'

export type ThresholdStudyReadiness =
  | 'not_ready_small_sample'
  | 'not_ready_too_many_unknowns'
  | 'not_ready_missing_outcomes'
  | 'limited_review_possible'
  | 'ready_for_human_threshold_study'

export interface SignalQualityCampaign {
  id: string
  name: string
  startedAt: string
  endedAt?: string | null
  status: SignalQualityCampaignStatus
  targetWindows: number
  completedWindows: number
  targetMinimumCases: number
  targetMinimumCompletedFixtures: number
  totalWorkerRuns: number
  totalSessions: number
  totalFixtures: number
  totalSnapshots: number
  totalSignalQualityCases: number
  totalEvaluableCases: number
  totalNotEvaluableCases: number
  limitations: string[]
  createdAt: string
  updatedAt: string
}

export interface SignalQualityCampaignWindow {
  id: string
  campaignId: string
  windowLabel: string
  startedAt: string
  endedAt?: string | null
  status: SignalQualityCampaignWindowStatus
  workerRunId?: string | null
  fixturesSelected: number
  snapshotsCaptured: number
  postMatchFixturesProcessed: number
  signalQualityCasesCreated: number
  signalQualityReviewId?: string | null
  freshness?: string | null
  limitations: string[]
}

export interface SignalQualityCampaignSummary {
  campaignId: string
  generatedAt: string
  sampleSize: number
  windowsCompleted: number
  reliableObserve: number
  usefulButLimited: number
  noisyMonitorOnly: number
  insufficientData: number
  misleadingCandidate: number
  pendingMoreSample: number
  topUsefulSignals: Array<{ signalKind: LiveFirstSignalKind; count: number }>
  topNoisySignals: Array<{ signalKind: LiveFirstSignalKind; count: number }>
  humanReviewQueueSize: number
  thresholdStudyReadiness: ThresholdStudyReadiness
  recommendations: string[]
  limitations: string[]
}

// ── Human review queue ───────────────────────────────────────────────────────

export type HumanReviewPriority = 'low' | 'medium' | 'high' | 'critical'
export type HumanReviewStatus = 'pending' | 'reviewed' | 'dismissed' | 'needs_more_data'

export interface HumanReviewItem {
  id: string
  caseId: string
  fixtureId: string
  signalKind: LiveFirstSignalKind
  reason: string
  priority: HumanReviewPriority
  suggestedReviewQuestion: string
  evidenceSummary: string
  limitations: string[]
  status: HumanReviewStatus
  reviewerNotes?: string | null
  createdAt: string
  reviewedAt?: string | null
}

// ── Reliability baseline (observational, NOT probability) ────────────────────

export interface SignalReliabilityBaseline {
  id: string
  generatedAt: string
  sampleSize: number
  bySignalKind: Array<{
    signalKind: LiveFirstSignalKind
    sampleSize: number
    strongRatio: number
    insufficientRatio: number
    notEvaluableRatio: number
  }>
  evidenceStrengthDistribution: Record<LiveFirstSignalEvidenceStrength, number>
  qualityGradeDistribution: Record<LiveFirstSignalQualityGrade, number>
  outcomeAlignmentDistribution: Record<LiveFirstSignalOutcomeAlignment, number>
  noiseRiskDistribution: Record<LiveFirstSignalNoiseRisk, number>
  notEvaluableRatio: number
  insufficientDataRatio: number
  staleSnapshotRatio: number
  missingStatsRatio: number
  missingTimelineRatio: number
  humanReviewRatio: number
  /** Observational consistency note — NOT a probability or accuracy claim. */
  consistencyNote: string
  thresholdStudyReadiness: ThresholdStudyReadiness
  limitations: string[]
}
