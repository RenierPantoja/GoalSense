/**
 * Human Review Adjudication Types — B72
 * ─────────────────────────────────────────────────────────────────────────────
 * Records conservative human (or system-default) adjudications of human review
 * queue items. Observe only — adjudication NEVER changes policy, threshold, score,
 * confidence, or runtime. Reviewer private notes are stored locally and NEVER
 * published to any public summary.
 */
import type { LiveFirstSignalKind } from './liveFirstSignalQuality.types.js'
import type { HumanReviewPriority } from './signalQualityCampaign.types.js'
import type { HumanReviewTriageBucket } from './humanReviewTriage.types.js'

export type HumanReviewAdjudicationDecision =
  | 'needs_more_samples'
  | 'insufficient_evidence'
  | 'duplicate_of_existing_pattern'
  | 'confirmed_noise'
  | 'confirmed_useful_signal'

export type AdjudicatedBy = 'system_conservative_default' | 'human'

export interface HumanReviewAdjudicationRecord {
  id: string
  itemId: string
  caseId: string
  fixtureId: string
  signalKind: LiveFirstSignalKind
  bucket: HumanReviewTriageBucket | null
  decision: HumanReviewAdjudicationDecision
  /** Short, public-safe rationale (no reviewer notes). */
  rationale: string
  /** PRIVATE reviewer note — stored locally, NEVER published. */
  reviewerNotesPrivate: string | null
  priorityBefore: HumanReviewPriority
  conservativeDefaultApplied: boolean
  adjudicatedBy: AdjudicatedBy
  /** Always 'none' — adjudication is observe-only. */
  runtimeImpact: 'none'
  createdAt: string
}

export interface HumanReviewAdjudicationSummary {
  id: string
  generatedAt: string
  totalAdjudicated: number
  pendingBefore: number
  pendingAfter: number
  byDecision: Record<HumanReviewAdjudicationDecision, number>
  needsMoreSamples: number
  insufficientEvidence: number
  duplicateOfExistingPattern: number
  confirmedNoise: number
  confirmedUsefulSignal: number
  conservativeDefaultsApplied: number
  /** Assertion flag — always false; reviewer private notes are never published. */
  reviewerPrivateNotesExposed: boolean
  limitations: string[]
}
