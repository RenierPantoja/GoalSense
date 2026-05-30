/**
 * alertSyncQueue — manages write-through sync for Command Center alerts.
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase B4: Alerts Backend Sync — localStorage remains primary.
 * Backend receives alert creates and resolutions for persistence.
 */
import type { CommandCenterAlert, AlertSyncStatus } from '@/context/AlertsContext'
import { isBackendEnabled, createBackendAlert, resolveBackendAlert, getBackendHealth } from './commandBackendClient'
import { toBackendAlertPayload, toBackendResolvePayload } from './alertBackendAdapter'

// ─── Sync Metadata Helpers ───────────────────────────────────────────────────

export function markAlertSynced(alert: CommandCenterAlert, backendId: string): CommandCenterAlert {
  return { ...alert, backendId, syncStatus: 'synced', lastSyncedAt: new Date().toISOString(), syncError: undefined }
}

export function markAlertPendingCreate(alert: CommandCenterAlert): CommandCenterAlert {
  return { ...alert, syncStatus: 'pending_create', syncError: undefined }
}

export function markAlertPendingResolve(alert: CommandCenterAlert): CommandCenterAlert {
  return { ...alert, syncStatus: 'pending_resolve', syncError: undefined }
}

export function markAlertSyncError(alert: CommandCenterAlert, error: string): CommandCenterAlert {
  return { ...alert, syncStatus: 'error', syncError: error }
}

// ─── Sync Results ────────────────────────────────────────────────────────────

export interface AlertSyncResult {
  success: boolean
  alert: CommandCenterAlert
  error?: string
}

// ─── Write-Through Operations ────────────────────────────────────────────────

/**
 * Create alert on backend. Returns updated alert with backendId.
 */
export async function syncCreateAlert(alert: CommandCenterAlert): Promise<AlertSyncResult> {
  if (!isBackendEnabled()) {
    return { success: false, alert, error: 'Backend not configured' }
  }

  try {
    const payload = toBackendAlertPayload(alert)
    const result = await createBackendAlert(payload)

    if (result && result.id) {
      return { success: true, alert: markAlertSynced(alert, result.id) }
    }
    return { success: false, alert: markAlertPendingCreate(alert), error: 'Backend returned no data' }
  } catch (err: any) {
    // 409 = duplicate signature already exists on backend
    if (err?.status === 409) {
      // Treat as synced — backend already has this alert
      return { success: true, alert: { ...alert, syncStatus: 'synced', syncError: undefined } }
    }
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, alert: markAlertSyncError(alert, msg), error: msg }
  }
}

/**
 * Resolve alert on backend. If no backendId, creates first then resolves.
 */
export async function syncResolveAlert(alert: CommandCenterAlert): Promise<AlertSyncResult> {
  if (!isBackendEnabled()) {
    return { success: false, alert, error: 'Backend not configured' }
  }

  let backendId = alert.backendId

  // If alert was never synced, create it first
  if (!backendId) {
    try {
      const createResult = await syncCreateAlert(alert)
      if (createResult.success && createResult.alert.backendId) {
        backendId = createResult.alert.backendId
      } else {
        return { success: false, alert: markAlertPendingResolve(alert), error: 'Cannot resolve: create failed' }
      }
    } catch {
      return { success: false, alert: markAlertPendingResolve(alert), error: 'Cannot resolve: create failed' }
    }
  }

  try {
    const payload = toBackendResolvePayload(alert)
    const result = await resolveBackendAlert(backendId, payload)

    if (result && result.id) {
      return {
        success: true,
        alert: { ...alert, backendId, backendResolutionId: result.id, syncStatus: 'synced', lastSyncedAt: new Date().toISOString(), syncError: undefined },
      }
    }
    return { success: false, alert: markAlertPendingResolve({ ...alert, backendId }), error: 'Resolve returned no data' }
  } catch (err: any) {
    // 404 = alert was deleted on backend — recreate + resolve
    if (err?.status === 404) {
      try {
        const recreate = await syncCreateAlert({ ...alert, backendId: undefined })
        if (recreate.success && recreate.alert.backendId) {
          const payload = toBackendResolvePayload(alert)
          const result = await resolveBackendAlert(recreate.alert.backendId, payload)
          if (result && result.id) {
            return {
              success: true,
              alert: { ...alert, backendId: recreate.alert.backendId, backendResolutionId: result.id, syncStatus: 'synced', lastSyncedAt: new Date().toISOString(), syncError: undefined },
            }
          }
        }
      } catch { /* fall through */ }
    }
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, alert: markAlertSyncError({ ...alert, backendId }, msg), error: msg }
  }
}

// ─── Batch Sync ──────────────────────────────────────────────────────────────

export interface AlertBatchSyncResult {
  created: number
  resolved: number
  failed: number
}

/**
 * Process all pending alert sync operations.
 */
export async function syncPendingAlerts(alerts: CommandCenterAlert[]): Promise<{ updatedAlerts: CommandCenterAlert[]; result: AlertBatchSyncResult }> {
  if (!isBackendEnabled()) {
    return { updatedAlerts: alerts, result: { created: 0, resolved: 0, failed: 0 } }
  }

  const health = await getBackendHealth().catch(() => null)
  if (!health) {
    return { updatedAlerts: alerts, result: { created: 0, resolved: 0, failed: 0 } }
  }

  const batchResult: AlertBatchSyncResult = { created: 0, resolved: 0, failed: 0 }
  const updatedMap = new Map<string, CommandCenterAlert>()

  // Process pending creates first
  const pendingCreate = alerts.filter(a => a.syncStatus === 'pending_create')
  for (const a of pendingCreate) {
    const r = await syncCreateAlert(a)
    if (r.success) batchResult.created++; else batchResult.failed++
    updatedMap.set(a.id, r.alert)
  }

  // Process pending resolves (need backendId from create step)
  const pendingResolve = alerts.filter(a => a.syncStatus === 'pending_resolve')
  for (const a of pendingResolve) {
    // Check if we just created it in the step above
    const updated = updatedMap.get(a.id) || a
    const r = await syncResolveAlert(updated)
    if (r.success) batchResult.resolved++; else batchResult.failed++
    updatedMap.set(a.id, r.alert)
  }

  // Retry errors
  const errors = alerts.filter(a => a.syncStatus === 'error')
  for (const a of errors) {
    if (!a.backendId) {
      const r = await syncCreateAlert(a)
      if (r.success) batchResult.created++; else batchResult.failed++
      updatedMap.set(a.id, r.alert)
    } else if (a.status !== 'pending') {
      // Has backendId but resolved locally — sync resolution
      const r = await syncResolveAlert(a)
      if (r.success) batchResult.resolved++; else batchResult.failed++
      updatedMap.set(a.id, r.alert)
    }
  }

  const updatedAlerts = alerts.map(a => updatedMap.get(a.id) || a)
  return { updatedAlerts, result: batchResult }
}
