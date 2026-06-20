/**
 * Evidence Context contracts (Phase B34).
 * ─────────────────────────────────────────────────────────────────────────────
 * Carries a real snapshotId (when available) from the live pipeline into the
 * alert / outcome / opportunity / policy flows — so an EXACT evidence link can be
 * created without coupling to any score/confidence/counter calculation. When no
 * real snapshotId exists, strength stays inferred/unknown and a limitation is set.
 */
import type { EvidenceLinkStrength } from './evidenceLineage.types.js'

export interface LiveEvidenceContext {
  fixtureId: string
  provider: string | null
  currentSnapshotId: string | null
  currentSnapshotCapturedAt: string | null
  currentMinute: number | null
  currentStatus: string | null
  currentScore: { home: number; away: number } | null
  snapshotWriteDecision: string | null
  snapshotWasWritten: boolean
  snapshotWasSkipped: boolean
  skippedReason: string | null
  evidenceStrength: EvidenceLinkStrength
  limitations: string[]
}

export interface AlertEvidenceContext {
  triggerSnapshotId: string | null
  triggerSnapshotCapturedAt: string | null
  triggerMinute: number | null
  triggerEvidenceStrength: EvidenceLinkStrength
  triggerEvidenceLimitations: string[]
  outcomeSnapshotId: string | null
  outcomeSnapshotCapturedAt: string | null
  outcomeMinute: number | null
  outcomeEvidenceStrength: EvidenceLinkStrength
  outcomeEvidenceLimitations: string[]
}

export interface OpportunityEvidenceContext {
  evidenceSnapshotId: string | null
  evidenceSnapshotCapturedAt: string | null
  evidenceMinute: number | null
  evidenceStrength: EvidenceLinkStrength
  limitations: string[]
}

export interface PolicyEvidenceContext {
  policyEvidenceSnapshotId: string | null
  policyEvidenceCapturedAt: string | null
  policyEvidenceMinute: number | null
  evidenceStrength: EvidenceLinkStrength
  limitations: string[]
}

/** Strength for a snapshot id: exact when a real id exists, else the given fallback. */
export function strengthForSnapshotId(snapshotId: string | null | undefined, fallback: EvidenceLinkStrength = 'window_inferred'): EvidenceLinkStrength {
  return snapshotId ? 'exact' : fallback
}
