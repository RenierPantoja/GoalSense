/**
 * usePatternWriteThrough — wraps PatternContext mutations with backend write-through.
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 3: Write-Through — localStorage remains primary, backend receives writes async.
 *
 * Usage: Call this hook in CommandCenterPage and pass the returned functions
 * instead of raw PatternContext mutations to components that create/update/delete patterns.
 *
 * The hook:
 * - Calls the original PatternContext mutation immediately (local-first)
 * - Fires an async backend write (non-blocking)
 * - Updates sync metadata on the pattern via updatePattern
 * - If backend is offline, marks pattern as pending
 * - When backend comes online, syncs pending items
 */
import { useCallback, useRef, useEffect } from 'react'
import { isBackendEnabled } from './commandBackendClient'
import {
  syncCreatePattern,
  syncUpdatePattern,
  syncDeletePattern,
  syncPendingPatterns,
  getPendingSyncSummary,
  type BatchSyncResult,
} from './patternSyncQueue'
import type { Pattern } from '@/features/command/types/commandTypes'

interface PatternContextMutations {
  createPattern: (p: Omit<Pattern, 'id' | 'createdAt' | 'updatedAt'>) => Pattern
  createFromTemplate: (templateId: string) => Pattern | null
  updatePattern: (id: string, patch: Partial<Pattern>) => void
  deletePattern: (id: string) => void
  togglePattern: (id: string) => void
  patterns: Pattern[]
}

interface WriteThoughCallbacks {
  /** Wraps createPattern with backend write-through */
  createPatternWT: (p: Omit<Pattern, 'id' | 'createdAt' | 'updatedAt'>) => Pattern
  /** Wraps createFromTemplate with backend write-through */
  createFromTemplateWT: (templateId: string) => Pattern | null
  /** Wraps updatePattern with backend write-through */
  updatePatternWT: (id: string, patch: Partial<Pattern>) => void
  /** Wraps deletePattern with backend write-through */
  deletePatternWT: (id: string) => void
  /** Wraps togglePattern with backend write-through */
  togglePatternWT: (id: string) => void
  /** Manually trigger sync of pending items */
  syncPending: () => Promise<BatchSyncResult | null>
  /** Last batch sync result */
  lastBatchResult: BatchSyncResult | null
}

export function usePatternWriteThrough(
  ctx: PatternContextMutations,
  backendOnline: boolean,
): WriteThoughCallbacks {
  const patternsRef = useRef(ctx.patterns)
  patternsRef.current = ctx.patterns
  const lastBatchRef = useRef<BatchSyncResult | null>(null)

  const enabled = isBackendEnabled()

  // ─── Create ──────────────────────────────────────────────────────────────
  const createPatternWT = useCallback((input: Omit<Pattern, 'id' | 'createdAt' | 'updatedAt'>): Pattern => {
    // Add initial sync metadata
    const inputWithSync = enabled
      ? { ...input, syncStatus: 'pending_create' as const }
      : input

    // Create locally first (immediate)
    const created = ctx.createPattern(inputWithSync)

    if (!enabled) return created

    // Async backend write (non-blocking)
    syncCreatePattern(created).then(result => {
      if (result.success) {
        ctx.updatePattern(created.id, { backendId: result.pattern.backendId, syncStatus: 'synced', lastSyncedAt: new Date().toISOString(), syncError: undefined })
      } else {
        ctx.updatePattern(created.id, { syncStatus: 'pending_create', syncError: result.error })
      }
    }).catch(() => {
      ctx.updatePattern(created.id, { syncStatus: 'pending_create', syncError: 'Network error' })
    })

    return created
  }, [ctx, enabled])

  // ─── Create from Template ────────────────────────────────────────────────
  const createFromTemplateWT = useCallback((templateId: string): Pattern | null => {
    const created = ctx.createFromTemplate(templateId)
    if (!created) return null

    if (!enabled) return created

    // Mark pending and fire async write
    ctx.updatePattern(created.id, { syncStatus: 'pending_create' })

    syncCreatePattern(created).then(result => {
      if (result.success) {
        ctx.updatePattern(created.id, { backendId: result.pattern.backendId, syncStatus: 'synced', lastSyncedAt: new Date().toISOString(), syncError: undefined })
      } else {
        ctx.updatePattern(created.id, { syncStatus: 'pending_create', syncError: result.error })
      }
    }).catch(() => {
      ctx.updatePattern(created.id, { syncStatus: 'pending_create', syncError: 'Network error' })
    })

    return created
  }, [ctx, enabled])

  // ─── Update ──────────────────────────────────────────────────────────────
  const updatePatternWT = useCallback((id: string, patch: Partial<Pattern>) => {
    // Apply locally first (immediate)
    ctx.updatePattern(id, patch)

    if (!enabled) return

    // Build the full updated pattern from current state + patch
    // (avoids race condition with setTimeout reading stale ref)
    const current = patternsRef.current.find(p => p.id === id)
    if (!current) return
    const updatedPattern: Pattern = { ...current, ...patch, updatedAt: new Date().toISOString() }

    syncUpdatePattern(updatedPattern).then(result => {
      if (result.success) {
        ctx.updatePattern(id, { backendId: result.pattern.backendId, syncStatus: 'synced', lastSyncedAt: new Date().toISOString(), syncError: undefined })
      } else {
        ctx.updatePattern(id, { syncStatus: 'pending_update', syncError: result.error })
      }
    }).catch(() => {
      ctx.updatePattern(id, { syncStatus: 'pending_update', syncError: 'Network error' })
    })
  }, [ctx, enabled])

  // ─── Delete ──────────────────────────────────────────────────────────────
  const deletePatternWT = useCallback((id: string) => {
    const pattern = patternsRef.current.find(p => p.id === id)

    // Delete locally first (immediate)
    ctx.deletePattern(id)

    if (!enabled || !pattern) return

    // If pattern was never synced, no backend call needed
    if (!pattern.backendId) return

    // Async backend delete (non-blocking, fire-and-forget for deleted patterns)
    syncDeletePattern(pattern).catch(() => {
      // Pattern is already deleted locally. If backend delete fails,
      // it will be orphaned on backend — acceptable for Phase 3.
      // Phase 4 will handle tombstones properly.
      console.warn(`[WriteThrough] Failed to delete pattern ${id} from backend`)
    })
  }, [ctx, enabled])

  // ─── Toggle ──────────────────────────────────────────────────────────────
  const togglePatternWT = useCallback((id: string) => {
    // Toggle locally first (immediate)
    ctx.togglePattern(id)

    if (!enabled) return

    // Build the toggled pattern from current state (before React updates ref)
    const current = patternsRef.current.find(p => p.id === id)
    if (!current) return
    const toggledPattern: Pattern = { ...current, status: current.status === 'active' ? 'paused' : 'active', updatedAt: new Date().toISOString() }

    syncUpdatePattern(toggledPattern).then(result => {
      if (result.success) {
        ctx.updatePattern(id, { backendId: result.pattern.backendId, syncStatus: 'synced', lastSyncedAt: new Date().toISOString(), syncError: undefined })
      } else {
        ctx.updatePattern(id, { syncStatus: 'pending_update', syncError: result.error })
      }
    }).catch(() => {
      ctx.updatePattern(id, { syncStatus: 'pending_update', syncError: 'Network error' })
    })
  }, [ctx, enabled])

  // ─── Sync Pending ────────────────────────────────────────────────────────
  const syncPending = useCallback(async (): Promise<BatchSyncResult | null> => {
    if (!enabled) return null

    const current = patternsRef.current
    const summary = getPendingSyncSummary(current)
    if (summary.totalPending === 0 && summary.errors.length === 0) return null

    const { updatedPatterns, result } = await syncPendingPatterns(current)

    // Apply sync metadata updates
    for (const updated of updatedPatterns) {
      const original = current.find(p => p.id === updated.id)
      if (original && (original.syncStatus !== updated.syncStatus || original.backendId !== updated.backendId)) {
        ctx.updatePattern(updated.id, {
          backendId: updated.backendId,
          syncStatus: updated.syncStatus,
          lastSyncedAt: updated.lastSyncedAt,
          syncError: updated.syncError,
        })
      }
    }

    lastBatchRef.current = result
    return result
  }, [ctx, enabled])

  // ─── Auto-sync when backend comes online ─────────────────────────────────
  const prevOnlineRef = useRef(backendOnline)
  useEffect(() => {
    if (backendOnline && !prevOnlineRef.current && enabled) {
      // Backend just came online — sync pending items
      syncPending()
    }
    prevOnlineRef.current = backendOnline
  }, [backendOnline, enabled, syncPending])

  return {
    createPatternWT,
    createFromTemplateWT,
    updatePatternWT,
    deletePatternWT,
    togglePatternWT,
    syncPending,
    lastBatchResult: lastBatchRef.current,
  }
}
