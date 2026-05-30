/**
 * patternSyncQueue — manages write-through sync state for patterns.
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 3: Write-Through — localStorage remains primary, backend receives writes.
 * If backend is offline, patterns are marked pending and synced when backend returns.
 *
 * This module is pure logic — no React hooks, no side effects on import.
 */
import type { Pattern } from '@/features/command/types/commandTypes'
import { isBackendEnabled, createBackendPattern, updateBackendPattern, deleteBackendPattern, getBackendHealth, listBackendPatterns } from './commandBackendClient'
import { toBackendPayload } from './patternBackendAdapter'

// ─── Sync Metadata Helpers ───────────────────────────────────────────────────

export function markPendingCreate(pattern: Pattern): Pattern {
  return { ...pattern, syncStatus: 'pending_create', syncError: undefined }
}

export function markPendingUpdate(pattern: Pattern): Pattern {
  return { ...pattern, syncStatus: 'pending_update', syncError: undefined }
}

export function markPendingDelete(pattern: Pattern): Pattern {
  return { ...pattern, syncStatus: 'pending_delete', syncError: undefined }
}

export function markSynced(pattern: Pattern, backendId: string): Pattern {
  return { ...pattern, backendId, syncStatus: 'synced', lastSyncedAt: new Date().toISOString(), syncError: undefined }
}

export function markSyncError(pattern: Pattern, error: string): Pattern {
  return { ...pattern, syncStatus: 'error', syncError: error }
}

export function clearSyncError(pattern: Pattern): Pattern {
  return { ...pattern, syncError: undefined }
}

export function markLocalOnly(pattern: Pattern): Pattern {
  return { ...pattern, syncStatus: 'local_only', syncError: undefined }
}

// ─── Pending Detection ───────────────────────────────────────────────────────

export interface PendingSyncSummary {
  pendingCreate: Pattern[]
  pendingUpdate: Pattern[]
  pendingDelete: Pattern[]
  errors: Pattern[]
  synced: Pattern[]
  localOnly: Pattern[]
  totalPending: number
}

export function getPendingSyncSummary(patterns: Pattern[]): PendingSyncSummary {
  const pendingCreate: Pattern[] = []
  const pendingUpdate: Pattern[] = []
  const pendingDelete: Pattern[] = []
  const errors: Pattern[] = []
  const synced: Pattern[] = []
  const localOnly: Pattern[] = []

  for (const p of patterns) {
    switch (p.syncStatus) {
      case 'pending_create': pendingCreate.push(p); break
      case 'pending_update': pendingUpdate.push(p); break
      case 'pending_delete': pendingDelete.push(p); break
      case 'error': errors.push(p); break
      case 'synced': synced.push(p); break
      default: localOnly.push(p); break
    }
  }

  return {
    pendingCreate,
    pendingUpdate,
    pendingDelete,
    errors,
    synced,
    localOnly,
    totalPending: pendingCreate.length + pendingUpdate.length + pendingDelete.length,
  }
}

// ─── Write-Through Operations ────────────────────────────────────────────────

export interface SyncResult {
  success: boolean
  pattern: Pattern
  error?: string
}

/**
 * Attempt to create a pattern on the backend.
 * Returns the pattern with updated sync metadata.
 * Anti-duplication: if backend already has a pattern with same stable key, reuse it.
 */
export async function syncCreatePattern(pattern: Pattern): Promise<SyncResult> {
  if (!isBackendEnabled()) {
    return { success: false, pattern: markLocalOnly(pattern), error: 'Backend not configured' }
  }

  try {
    const payload = toBackendPayload(pattern)
    const result = await createBackendPattern(payload)

    if (result && result.id) {
      return { success: true, pattern: markSynced(pattern, result.id) }
    }
    return { success: false, pattern: markPendingCreate(pattern), error: 'Backend returned no data' }
  } catch (err: any) {
    // 409 Conflict or similar — pattern may already exist on backend
    // Try to find it by listing and matching
    if (err?.status === 409) {
      try {
        const existing = await listBackendPatterns()
        if (existing) {
          const match = existing.find((bp: any) => bp.name === pattern.name && bp.templateId === (pattern.templateId || null))
          if (match) {
            return { success: true, pattern: markSynced(pattern, match.id) }
          }
        }
      } catch { /* fall through */ }
    }
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, pattern: markSyncError(markPendingCreate(pattern), msg), error: msg }
  }
}

/**
 * Attempt to update a pattern on the backend.
 * If no backendId exists, falls back to create.
 * If backend returns 404, falls back to create (pattern was deleted on backend).
 */
export async function syncUpdatePattern(pattern: Pattern): Promise<SyncResult> {
  if (!isBackendEnabled()) {
    return { success: false, pattern: markLocalOnly(pattern), error: 'Backend not configured' }
  }

  try {
    if (pattern.backendId) {
      // PATCH existing
      const payload = toBackendPayload(pattern)
      const result = await updateBackendPattern(pattern.backendId, payload)

      if (result) {
        return { success: true, pattern: markSynced(pattern, pattern.backendId) }
      }
      // null result but no throw means unexpected — try create
      return await syncCreatePattern(pattern)
    }

    // No backendId — create on backend
    return await syncCreatePattern(pattern)
  } catch (err: any) {
    // 404 means backend lost the pattern — recreate it
    if (err?.status === 404) {
      try {
        return await syncCreatePattern({ ...pattern, backendId: undefined })
      } catch (createErr) {
        const msg = createErr instanceof Error ? createErr.message : 'Recreate failed after 404'
        return { success: false, pattern: markSyncError(markPendingUpdate(pattern), msg), error: msg }
      }
    }
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, pattern: markSyncError(markPendingUpdate(pattern), msg), error: msg }
  }
}

/**
 * Attempt to delete a pattern from the backend.
 * If pattern was never synced (no backendId), just mark as done.
 * If backend returns 404, treat as success (already gone).
 */
export async function syncDeletePattern(pattern: Pattern): Promise<SyncResult> {
  if (!isBackendEnabled()) {
    return { success: true, pattern } // No backend = nothing to delete remotely
  }

  if (!pattern.backendId) {
    // Never synced to backend — nothing to delete remotely
    return { success: true, pattern }
  }

  try {
    await deleteBackendPattern(pattern.backendId)
    return { success: true, pattern }
  } catch (err: any) {
    // 404 means already deleted on backend — treat as success
    if (err?.status === 404) {
      return { success: true, pattern }
    }
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, pattern: markSyncError(markPendingDelete(pattern), msg), error: msg }
  }
}

// ─── Batch Sync (for pending items when backend comes online) ────────────────

export interface BatchSyncResult {
  created: number
  updated: number
  deleted: number
  failed: number
  results: SyncResult[]
}

/**
 * Process all pending sync operations sequentially.
 * Returns updated patterns array with sync metadata applied.
 */
export async function syncPendingPatterns(patterns: Pattern[]): Promise<{ updatedPatterns: Pattern[]; result: BatchSyncResult }> {
  if (!isBackendEnabled()) {
    return { updatedPatterns: patterns, result: { created: 0, updated: 0, deleted: 0, failed: 0, results: [] } }
  }

  // Verify backend is actually online before processing
  const health = await getBackendHealth().catch(() => null)
  if (!health) {
    return { updatedPatterns: patterns, result: { created: 0, updated: 0, deleted: 0, failed: 0, results: [] } }
  }

  const summary = getPendingSyncSummary(patterns)
  const batchResult: BatchSyncResult = { created: 0, updated: 0, deleted: 0, failed: 0, results: [] }
  const updatedMap = new Map<string, Pattern>()

  // Process creates
  for (const p of summary.pendingCreate) {
    const r = await syncCreatePattern(p)
    batchResult.results.push(r)
    if (r.success) batchResult.created++; else batchResult.failed++
    updatedMap.set(p.id, r.pattern)
  }

  // Process updates
  for (const p of summary.pendingUpdate) {
    const r = await syncUpdatePattern(p)
    batchResult.results.push(r)
    if (r.success) batchResult.updated++; else batchResult.failed++
    updatedMap.set(p.id, r.pattern)
  }

  // Process deletes
  for (const p of summary.pendingDelete) {
    const r = await syncDeletePattern(p)
    batchResult.results.push(r)
    if (r.success) batchResult.deleted++; else batchResult.failed++
    updatedMap.set(p.id, r.pattern)
  }

  // Also try to sync error patterns (retry)
  for (const p of summary.errors) {
    // Determine what operation was intended
    if (!p.backendId) {
      const r = await syncCreatePattern(p)
      batchResult.results.push(r)
      if (r.success) batchResult.created++; else batchResult.failed++
      updatedMap.set(p.id, r.pattern)
    } else {
      const r = await syncUpdatePattern(p)
      batchResult.results.push(r)
      if (r.success) batchResult.updated++; else batchResult.failed++
      updatedMap.set(p.id, r.pattern)
    }
  }

  // Apply updates to patterns array
  const updatedPatterns = patterns.map(p => updatedMap.get(p.id) || p)

  return { updatedPatterns, result: batchResult }
}
