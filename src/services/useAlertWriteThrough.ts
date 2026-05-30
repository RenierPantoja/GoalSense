/**
 * useAlertWriteThrough — wraps AlertsContext mutations with backend write-through.
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase B4.1: Hardened — fixes race conditions and localStorage sync metadata persistence.
 *
 * Strategy: Since AlertsContext doesn't expose a generic patch method for sync fields,
 * we maintain a separate sync metadata store in localStorage that is merged on read.
 * This avoids the bug where AlertsContext overwrites sync metadata on state updates.
 */
import { useCallback, useRef, useEffect, useState } from 'react'
import { isBackendEnabled } from './commandBackendClient'
import { syncCreateAlert, syncResolveAlert, syncPendingAlerts, type AlertBatchSyncResult } from './alertSyncQueue'
import type { CommandCenterAlert, CommandAlertStatus } from '@/context/AlertsContext'

// ─── Separate Sync Metadata Store ────────────────────────────────────────────
// Stored separately from AlertsContext to avoid overwrite on React state updates.

const ALERT_SYNC_META_KEY = 'goalsense_alert_sync_meta'

interface AlertSyncMeta {
  backendId?: string
  syncStatus?: string
  lastSyncedAt?: string
  syncError?: string
  backendResolutionId?: string
}

function loadSyncMeta(): Record<string, AlertSyncMeta> {
  try {
    const raw = localStorage.getItem(ALERT_SYNC_META_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function saveSyncMeta(meta: Record<string, AlertSyncMeta>): void {
  try { localStorage.setItem(ALERT_SYNC_META_KEY, JSON.stringify(meta)) } catch { /* */ }
}

function updateSyncMetaForAlert(alertId: string, patch: Partial<AlertSyncMeta>): void {
  const meta = loadSyncMeta()
  meta[alertId] = { ...(meta[alertId] || {}), ...patch }
  saveSyncMeta(meta)
}

/** Merge sync metadata into alerts for display purposes. */
export function mergeAlertSyncMeta(alerts: CommandCenterAlert[]): CommandCenterAlert[] {
  const meta = loadSyncMeta()
  return alerts.map(a => {
    const m = meta[a.id]
    if (!m) return a
    return {
      ...a,
      backendId: m.backendId || a.backendId,
      syncStatus: (m.syncStatus as any) || a.syncStatus,
      lastSyncedAt: m.lastSyncedAt || a.lastSyncedAt,
      syncError: m.syncError ?? a.syncError,
      backendResolutionId: m.backendResolutionId || a.backendResolutionId,
    }
  })
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface AlertContextMutations {
  registerCommandAlert: (alert: Omit<CommandCenterAlert, 'id' | 'createdAt'>) => void
  updateCommandAlertStatus: (id: string, status: CommandAlertStatus, extra?: { score?: { home: number; away: number }; reason?: string }) => void
  commandAlerts: CommandCenterAlert[]
}

interface AlertWriteThroughCallbacks {
  /** Wraps registerCommandAlert with backend write-through */
  registerCommandAlertWT: (alert: Omit<CommandCenterAlert, 'id' | 'createdAt'>) => void
  /** Wraps updateCommandAlertStatus with backend write-through */
  updateCommandAlertStatusWT: (id: string, status: CommandAlertStatus, extra?: { score?: { home: number; away: number }; reason?: string }) => void
  /** Manually sync pending alerts */
  syncPendingAlertsManual: () => Promise<AlertBatchSyncResult | null>
  /** Pending alert count */
  pendingAlertSyncCount: number
  /** Error alert count */
  errorAlertSyncCount: number
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useAlertWriteThrough(
  ctx: AlertContextMutations,
  backendOnline: boolean,
): AlertWriteThroughCallbacks {
  const alertsRef = useRef(ctx.commandAlerts)
  alertsRef.current = ctx.commandAlerts
  const [syncMetaVersion, setSyncMetaVersion] = useState(0)

  const enabled = isBackendEnabled()

  // Force re-read of sync meta counts when metadata changes
  const bumpMeta = useCallback(() => setSyncMetaVersion(v => v + 1), [])

  // ─── Register Alert ──────────────────────────────────────────────────────
  const registerCommandAlertWT = useCallback((input: Omit<CommandCenterAlert, 'id' | 'createdAt'>) => {
    // Register locally first (immediate) — no sync metadata in context state
    ctx.registerCommandAlert(input)

    if (!enabled) return

    // Use a short delay to let React state settle, then find the new alert
    setTimeout(() => {
      const current = alertsRef.current
      // Find the most recently created alert matching this input
      const created = current.find(a =>
        a.patternId === input.patternId &&
        a.fixtureId === input.fixtureId &&
        !loadSyncMeta()[a.id]?.backendId // Not already synced
      )
      if (!created) return

      // Mark as pending in sync meta
      updateSyncMetaForAlert(created.id, { syncStatus: 'pending_create' })
      bumpMeta()

      syncCreateAlert(created).then(result => {
        if (result.success && result.alert.backendId) {
          updateSyncMetaForAlert(created.id, {
            backendId: result.alert.backendId,
            syncStatus: 'synced',
            lastSyncedAt: new Date().toISOString(),
            syncError: undefined,
          })
        } else {
          updateSyncMetaForAlert(created.id, {
            syncStatus: 'pending_create',
            syncError: result.error,
          })
        }
        bumpMeta()
      }).catch(() => {
        updateSyncMetaForAlert(created.id, {
          syncStatus: 'pending_create',
          syncError: 'Network error',
        })
        bumpMeta()
      })
    }, 100)
  }, [ctx, enabled, bumpMeta])

  // ─── Update Alert Status (Resolution) ───────────────────────────────────
  const updateCommandAlertStatusWT = useCallback((id: string, status: CommandAlertStatus, extra?: { score?: { home: number; away: number }; reason?: string }) => {
    // Update locally first (immediate)
    ctx.updateCommandAlertStatus(id, status, extra)

    if (!enabled) return
    if (status === 'pending') return // No backend write for pending status

    // Build the resolved alert from current state + the status change
    setTimeout(() => {
      const current = alertsRef.current.find(a => a.id === id)
      if (!current) return

      // Merge sync meta to get backendId
      const meta = loadSyncMeta()[id]
      const alertWithMeta: CommandCenterAlert = {
        ...current,
        backendId: meta?.backendId || current.backendId,
      }

      syncResolveAlert(alertWithMeta).then(result => {
        if (result.success) {
          updateSyncMetaForAlert(id, {
            backendId: result.alert.backendId,
            backendResolutionId: result.alert.backendResolutionId,
            syncStatus: 'synced',
            lastSyncedAt: new Date().toISOString(),
            syncError: undefined,
          })
        } else {
          updateSyncMetaForAlert(id, {
            syncStatus: 'pending_resolve',
            syncError: result.error,
          })
        }
        bumpMeta()
      }).catch(() => {
        updateSyncMetaForAlert(id, {
          syncStatus: 'pending_resolve',
          syncError: 'Network error',
        })
        bumpMeta()
      })
    }, 100)
  }, [ctx, enabled, bumpMeta])

  // ─── Sync Pending ────────────────────────────────────────────────────────
  const syncPendingAlertsManual = useCallback(async (): Promise<AlertBatchSyncResult | null> => {
    if (!enabled) return null

    // Merge sync meta into alerts for processing
    const current = mergeAlertSyncMeta(alertsRef.current)
    const pending = current.filter(a => a.syncStatus === 'pending_create' || a.syncStatus === 'pending_resolve' || a.syncStatus === 'error')
    if (pending.length === 0) return null

    const { updatedAlerts, result } = await syncPendingAlerts(current)

    // Persist sync metadata updates
    for (const updated of updatedAlerts) {
      const original = current.find(a => a.id === updated.id)
      if (original && (original.syncStatus !== updated.syncStatus || original.backendId !== updated.backendId)) {
        updateSyncMetaForAlert(updated.id, {
          backendId: updated.backendId,
          backendResolutionId: updated.backendResolutionId,
          syncStatus: updated.syncStatus,
          lastSyncedAt: updated.lastSyncedAt,
          syncError: updated.syncError,
        })
      }
    }

    bumpMeta()
    return result
  }, [enabled, bumpMeta])

  // ─── Auto-sync when backend comes online ─────────────────────────────────
  const prevOnlineRef = useRef(backendOnline)
  useEffect(() => {
    if (backendOnline && !prevOnlineRef.current && enabled) {
      syncPendingAlertsManual()
    }
    prevOnlineRef.current = backendOnline
  }, [backendOnline, enabled, syncPendingAlertsManual])

  // ─── Counts (from sync meta store) ──────────────────────────────────────
  const meta = loadSyncMeta()
  const metaValues = Object.values(meta)
  void syncMetaVersion // Force re-render dependency when meta changes
  const pendingAlertSyncCount = metaValues.filter(m => m.syncStatus === 'pending_create' || m.syncStatus === 'pending_resolve').length
  const errorAlertSyncCount = metaValues.filter(m => m.syncStatus === 'error').length

  return {
    registerCommandAlertWT,
    updateCommandAlertStatusWT,
    syncPendingAlertsManual,
    pendingAlertSyncCount,
    errorAlertSyncCount,
  }
}
