/**
 * useAlertWriteThrough — wraps AlertsContext mutations with backend write-through.
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase B4: Alerts Backend Sync — localStorage remains primary.
 * Creates and resolutions are sent to backend async.
 */
import { useCallback, useRef, useEffect } from 'react'
import { isBackendEnabled } from './commandBackendClient'
import { syncCreateAlert, syncResolveAlert, syncPendingAlerts, type AlertBatchSyncResult } from './alertSyncQueue'
import type { CommandCenterAlert, CommandAlertStatus } from '@/context/AlertsContext'

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

export function useAlertWriteThrough(
  ctx: AlertContextMutations,
  backendOnline: boolean,
): AlertWriteThroughCallbacks {
  const alertsRef = useRef(ctx.commandAlerts)
  alertsRef.current = ctx.commandAlerts

  const enabled = isBackendEnabled()

  // ─── Register Alert ──────────────────────────────────────────────────────
  const registerCommandAlertWT = useCallback((input: Omit<CommandCenterAlert, 'id' | 'createdAt'>) => {
    // Add sync metadata
    const inputWithSync = enabled
      ? { ...input, syncStatus: 'pending_create' as const }
      : input

    // Register locally first (immediate)
    ctx.registerCommandAlert(inputWithSync)

    if (!enabled) return

    // Find the just-created alert (most recent with same patternId + fixtureId)
    // Use a microtask since registerCommandAlert is async state update
    setTimeout(() => {
      const current = alertsRef.current
      const created = current.find(a =>
        a.patternId === input.patternId &&
        a.fixtureId === input.fixtureId &&
        a.syncStatus === 'pending_create'
      )
      if (!created) return

      syncCreateAlert(created).then(result => {
        if (result.success && result.alert.backendId) {
          // Update the alert in context with sync metadata
          // We use updateCommandAlertStatus with same status to trigger a save
          // But we need direct access — use a workaround via the alerts array
          updateAlertSyncMetadata(created.id, {
            backendId: result.alert.backendId,
            syncStatus: 'synced',
            lastSyncedAt: new Date().toISOString(),
            syncError: undefined,
          })
        } else {
          updateAlertSyncMetadata(created.id, {
            syncStatus: 'pending_create',
            syncError: result.error,
          })
        }
      }).catch(() => {
        updateAlertSyncMetadata(created.id, {
          syncStatus: 'pending_create',
          syncError: 'Network error',
        })
      })
    }, 50)
  }, [ctx, enabled])

  // ─── Update Alert Status (Resolution) ───────────────────────────────────
  const updateCommandAlertStatusWT = useCallback((id: string, status: CommandAlertStatus, extra?: { score?: { home: number; away: number }; reason?: string }) => {
    // Update locally first (immediate)
    ctx.updateCommandAlertStatus(id, status, extra)

    if (!enabled) return
    if (status === 'pending') return // No backend write for pending status

    // Find the alert and sync resolution
    setTimeout(() => {
      const current = alertsRef.current.find(a => a.id === id)
      if (!current) return

      syncResolveAlert(current).then(result => {
        if (result.success) {
          updateAlertSyncMetadata(id, {
            backendId: result.alert.backendId,
            backendResolutionId: result.alert.backendResolutionId,
            syncStatus: 'synced',
            lastSyncedAt: new Date().toISOString(),
            syncError: undefined,
          })
        } else {
          updateAlertSyncMetadata(id, {
            syncStatus: 'pending_resolve',
            syncError: result.error,
          })
        }
      }).catch(() => {
        updateAlertSyncMetadata(id, {
          syncStatus: 'pending_resolve',
          syncError: 'Network error',
        })
      })
    }, 50)
  }, [ctx, enabled])

  // ─── Sync Metadata Update ───────────────────────────────────────────────
  // Since AlertsContext doesn't expose a generic patch method for sync fields,
  // we update via localStorage directly (the context will pick it up on next load).
  // This is acceptable for Phase B4 — Phase B5 can add a proper patchAlert method.
  const updateAlertSyncMetadata = useCallback((id: string, patch: Partial<CommandCenterAlert>) => {
    try {
      const raw = localStorage.getItem('goalsense_command_alerts')
      if (!raw) return
      const alerts: CommandCenterAlert[] = JSON.parse(raw)
      const idx = alerts.findIndex(a => a.id === id)
      if (idx === -1) return
      alerts[idx] = { ...alerts[idx], ...patch }
      localStorage.setItem('goalsense_command_alerts', JSON.stringify(alerts))
    } catch { /* non-critical */ }
  }, [])

  // ─── Sync Pending ────────────────────────────────────────────────────────
  const syncPendingAlertsManual = useCallback(async (): Promise<AlertBatchSyncResult | null> => {
    if (!enabled) return null

    const current = alertsRef.current
    const pending = current.filter(a => a.syncStatus === 'pending_create' || a.syncStatus === 'pending_resolve' || a.syncStatus === 'error')
    if (pending.length === 0) return null

    const { updatedAlerts, result } = await syncPendingAlerts(current)

    // Persist sync metadata updates
    for (const updated of updatedAlerts) {
      const original = current.find(a => a.id === updated.id)
      if (original && (original.syncStatus !== updated.syncStatus || original.backendId !== updated.backendId)) {
        updateAlertSyncMetadata(updated.id, {
          backendId: updated.backendId,
          backendResolutionId: updated.backendResolutionId,
          syncStatus: updated.syncStatus,
          lastSyncedAt: updated.lastSyncedAt,
          syncError: updated.syncError,
        })
      }
    }

    return result
  }, [enabled, updateAlertSyncMetadata])

  // ─── Auto-sync when backend comes online ─────────────────────────────────
  const prevOnlineRef = useRef(backendOnline)
  useEffect(() => {
    if (backendOnline && !prevOnlineRef.current && enabled) {
      syncPendingAlertsManual()
    }
    prevOnlineRef.current = backendOnline
  }, [backendOnline, enabled, syncPendingAlertsManual])

  // ─── Counts ──────────────────────────────────────────────────────────────
  const pendingAlertSyncCount = ctx.commandAlerts.filter(a => a.syncStatus === 'pending_create' || a.syncStatus === 'pending_resolve').length
  const errorAlertSyncCount = ctx.commandAlerts.filter(a => a.syncStatus === 'error').length

  return {
    registerCommandAlertWT,
    updateCommandAlertStatusWT,
    syncPendingAlertsManual,
    pendingAlertSyncCount,
    errorAlertSyncCount,
  }
}
