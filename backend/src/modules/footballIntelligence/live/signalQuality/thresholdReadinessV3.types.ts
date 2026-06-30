/**
 * Threshold Study Readiness V3 Types — B72
 * ─────────────────────────────────────────────────────────────────────────────
 * Richer, observe-only readiness assessment. V3 adds the adjudication gate: even
 * with enough sample, the study is not ready until the human review queue has been
 * adjudicated. Readiness NEVER changes runtime, policy, threshold, score, or confidence.
 */
import type { ThresholdStudyReadiness } from './signalQualityCampaign.types.js'

export interface ThresholdReadinessV3 {
  id: string
  generatedAt: string
  readiness: ThresholdStudyReadiness
  reason: string
  sampleSize: number
  evaluableCases: number
  unknownRatio: number
  notEvaluableRatio: number
  reviewQueuePending: number
  reviewQueueAdjudicated: number
  untriagedCriticalOrHighValue: number
  unadjudicatedRequiresReview: number
  minimumSampleForStudy: number
  /** Always false — readiness is observe-only. */
  changesRuntime: boolean
  limitations: string[]
}
