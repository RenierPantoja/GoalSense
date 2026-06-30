/**
 * Signal Quality Window Report Types — B71
 * ─────────────────────────────────────────────────────────────────────────────
 * Per-window quality report for the multi-window campaign. dataQualityScore is
 * OBSERVATIONAL, never a probability and never used for automated decisions.
 */
import type { LiveFirstSignalKind, LiveFirstSignalQualityGrade } from './liveFirstSignalQuality.types.js'

export interface SignalQualityWindowReport {
  id: string
  windowId: string
  campaignId: string
  generatedAt: string
  durationMinutes: number
  fixtures: number
  snapshots: number
  casesCreated: number
  casesByGrade: Partial<Record<LiveFirstSignalQualityGrade, number>>
  humanReviewItemsCreated: number
  usefulSignals: Array<{ signalKind: LiveFirstSignalKind; count: number }>
  noisySignals: Array<{ signalKind: LiveFirstSignalKind; count: number }>
  missingStatsRatio: number
  missingTimelineRatio: number
  pendingOutcomeRatio: number
  /** Observational only — NOT a probability or accuracy claim. */
  dataQualityScoreObservational: number
  limitations: string[]
}
