/**
 * Control Plane Public Summary Types — B66
 * ─────────────────────────────────────────────────────────────────────────────
 * Sanitized, allowlisted documents published to `controlPlanePublicSummaries`
 * by the local worker/backend (Admin SDK). The hosted Vercel control plane reads
 * THESE instead of the raw operational collections.
 */

export type ControlPlanePublicSummaryId =
  | 'latestWorkerStatus'
  | 'latestLiveSessions'
  | 'latestLeases'
  | 'latestDailyReport'
  | 'latestCausalCases'
  | 'latestRecoveryStatus'
  | 'latestCampaignSummary'
  | 'freshness'

export interface ControlPlanePublicSummaryDoc {
  /** Fixed document id (one of ControlPlanePublicSummaryId). */
  id: string
  /** Sanitized payload (allowlisted fields only). */
  data: Record<string, any>
  generatedAt: string
  /** Schema/version marker for the public read model. */
  publicModelVersion: string
  limitations: string[]
}

export interface ControlPlanePublicSnapshotResult {
  published: boolean
  reason: string
  publishedDocs: string[]
  throttledUntil?: string | null
  generatedAt: string
  forbiddenFieldsFound: string[]
}
