/**
 * Signal Quality Window Comparison Types — B72
 * ─────────────────────────────────────────────────────────────────────────────
 * Compares the most recent campaign windows so trends are visible across windows.
 * Observe only — all deltas/notes are observational, NOT probability or accuracy,
 * and never drive automated decisions.
 */
import type { LiveFirstSignalKind } from './liveFirstSignalQuality.types.js'

export interface WindowComparisonEntry {
  windowId: string
  generatedAt: string
  durationMinutes: number
  fixtures: number
  snapshots: number
  casesCreated: number
  missingStatsRatio: number
  missingTimelineRatio: number
  pendingOutcomeRatio: number
  dataQualityScoreObservational: number
}

export interface SignalQualityWindowComparison {
  id: string
  campaignId: string
  generatedAt: string
  windowsCompared: number
  windows: WindowComparisonEntry[]
  /** Latest-minus-previous deltas (observational only). */
  deltaDataQualityScore: number | null
  deltaPendingOutcomeRatio: number | null
  deltaMissingStatsRatio: number | null
  cumulativeCases: number
  recurringUsefulSignals: Array<{ signalKind: LiveFirstSignalKind; windows: number }>
  recurringNoisySignals: Array<{ signalKind: LiveFirstSignalKind; windows: number }>
  /** Observational trend note — NOT a probability or accuracy claim. */
  trendNote: string
  limitations: string[]
}
