/**
 * Snapshot Lifecycle contracts (Phase B32).
 * ─────────────────────────────────────────────────────────────────────────────
 * Safe lifecycle for live snapshots: active → protected | marked_for_deletion →
 * soft_deleted → hard_deleted. Nothing is deleted by default; protected snapshots
 * and unknown dependencies are never deletable. Pure types — no I/O.
 */

export type SnapshotLifecycleState =
  | 'active'
  | 'protected'
  | 'marked_for_deletion'
  | 'soft_deleted'
  | 'hard_deleted'
  | 'deletion_blocked'

export type SnapshotProtectionReason =
  | 'linked_to_alert'
  | 'linked_to_outcome'
  | 'linked_to_backtest'
  | 'linked_to_replay'
  | 'linked_to_learning'
  | 'linked_to_promoted_alert'
  | 'recent_snapshot'
  | 'important_event'
  | 'score_change'
  | 'status_change'
  | 'evidence_snapshot'
  | 'manual_protection'
  | 'unknown_dependency'

export type SnapshotRetentionMode = 'dry_run' | 'mark_only' | 'soft_delete' | 'hard_delete'

export interface SnapshotRetentionCandidate {
  snapshotId: string
  fixtureId: string
  capturedAt: string | null
  category: string
  lifecycleState: SnapshotLifecycleState
  protectionReasons: SnapshotProtectionReason[]
  eligibleForSoftDelete: boolean
  eligibleForHardDelete: boolean
  ageDays: number
  dataQuality: string
  limitations: string[]
}

export interface SnapshotRetentionRun {
  id: string
  mode: SnapshotRetentionMode
  requestedBy: string | null
  startedAt: string
  completedAt: string | null
  scanned: number
  protectedRecords: number
  candidates: number
  marked: number
  softDeleted: number
  hardDeleted: number
  blocked: number
  errors: string[]
  limitations: string[]
}

export interface LocalOpsMetricsSnapshot {
  id: string
  capturedAt: string
  profile: string
  guardMode: string
  providerCallsAllowed: number
  providerCallsBlocked: number
  snapshotsWritten: number
  snapshotsSkippedDuplicate: number
  snapshotsSkippedInterval: number
  snapshotsSkippedMax: number
  fixturesSkippedByCap: number
  readBudgetUsed: number
  writeBudgetUsed: number
  riskLevel: string
  warnings: number
}
