/**
 * Human Review Triage Types — B71
 * ─────────────────────────────────────────────────────────────────────────────
 * Structures the human review queue into buckets and auditable triage decisions.
 * Observe only — triage never deletes data, never changes policy/threshold/score,
 * and never auto-changes classification. Critical cases never disappear.
 */
import type { LiveFirstSignalKind } from './liveFirstSignalQuality.types.js'
import type { HumanReviewPriority } from './signalQualityCampaign.types.js'

export type HumanReviewTriageBucket =
  | 'critical_review'
  | 'high_value_review'
  | 'pattern_watch'
  | 'insufficient_data_bucket'
  | 'duplicate_cluster'
  | 'low_value_noise'
  | 'pending_outcome'
  | 'monitor_only'

export type HumanReviewTriageDecision =
  | 'keep_for_review'
  | 'downgrade_to_monitor_only'
  | 'group_as_duplicate'
  | 'wait_for_more_data'
  | 'dismiss_low_value'
  | 'escalate_high_priority'

export type HumanReviewTriageReason =
  | 'strong_contradiction'
  | 'weak_alert_candidate'
  | 'repeated_noise_pattern'
  | 'missing_critical_context'
  | 'single_snapshot_pressure'
  | 'stale_snapshot'
  | 'no_outcome_yet'
  | 'duplicate_signal'
  | 'low_sample'
  | 'partial_alignment'
  | 'high_noise_risk'

export interface HumanReviewTriageResult {
  itemId: string
  caseId: string
  fixtureId: string
  signalKind: LiveFirstSignalKind
  bucket: HumanReviewTriageBucket
  decision: HumanReviewTriageDecision
  reason: HumanReviewTriageReason
  priorityBefore: HumanReviewPriority
  priorityAfter: HumanReviewPriority
  clusterId?: string | null
  requiresHumanReview: boolean
  suggestedQuestion: string
  limitations: string[]
  createdAt: string
}

export interface HumanReviewTriageSummary {
  id: string
  generatedAt: string
  totalItems: number
  requiresHumanReview: number
  monitorOnly: number
  duplicateClusters: number
  criticalReview: number
  highValueReview: number
  patternWatch: number
  insufficientDataBucket: number
  pendingOutcome: number
  lowValueNoise: number
  dismissedLowValue: number
  topReviewReasons: Array<{ reason: HumanReviewTriageReason; count: number }>
  topDuplicatePatterns: Array<{ pattern: string; count: number }>
  suggestedHumanReviewBatch: Array<{
    caseId: string
    fixtureId: string
    signalKind: LiveFirstSignalKind
    bucket: HumanReviewTriageBucket
    priorityAfter: HumanReviewPriority
    suggestedQuestion: string
  }>
  limitations: string[]
}
