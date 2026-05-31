/**
 * useBackendAlertsMirror — read-only mirror of backend alerts for diagnostics.
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase B9: Read mirror only. Does NOT alter localStorage or AlertsContext.
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import {
  isBackendEnabled,
  getBackendAlerts,
  getBackendPatternWorkerStatus,
  getBackendResolutionWorkerStatus,
  getLiveMonitorStatus,
} from './commandBackendClient'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BackendAlertView {
  id: string
  patternId: string
  patternName: string
  fixtureId: string
  homeTeam: string
  awayTeam: string
  competition: string
  status: string
  confidence: number
  signalState: string
  triggerMinute: number | null
  triggerScoreHome: number
  triggerScoreAway: number
  source: string
  duplicateSignature: string | null
  createdAt: string
  hasResolution: boolean
}

export interface WorkerStatusSummary {
  patternWorker: { enabled: boolean; running: boolean; lastRunAt: string | null; alertsCreated: number; blocked: number; duplicatesBlocked: number } | null
  resolutionWorker: { enabled: boolean; running: boolean; lastRunAt: string | null; resolved: number; confirmed: number; partial: number; failed: number; unknown: number } | null
  liveMonitor: { enabled: boolean; running: boolean; lastRunAt: string | null; fixturesSeen: number; snapshotsCreated: number; richSnapshots: number } | null
}

export interface BackendAlertsMirrorState {
  enabled: boolean
  loading: boolean
  alerts: BackendAlertView[]
  totalCount: number
  pendingCount: number
  resolvedCount: number
  workerCreatedCount: number
  confirmedCount: number
  failedCount: number
  unknownCount: number
  workerStatuses: WorkerStatusSummary
  lastFetchedAt: string | null
  error: string | null
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

function adaptBackendAlert(raw: any): BackendAlertView {
  const evidence = safeParseJson(raw.evidenceJson, {})
  return {
    id: raw.id,
    patternId: raw.patternId,
    patternName: evidence.patternName || raw.patternId,
    fixtureId: raw.fixtureId,
    homeTeam: evidence.homeTeam || '',
    awayTeam: evidence.awayTeam || '',
    competition: evidence.competition || '',
    status: raw.status,
    confidence: raw.confidence,
    signalState: raw.signalState || 'unknown',
    triggerMinute: raw.triggerMinute,
    triggerScoreHome: raw.triggerScoreHome || 0,
    triggerScoreAway: raw.triggerScoreAway || 0,
    source: evidence.source || 'unknown',
    duplicateSignature: raw.duplicateSignature || null,
    createdAt: raw.createdAt,
    hasResolution: raw.status !== 'pending',
  }
}

function safeParseJson(str: string | null | undefined, fallback: any): any {
  if (!str) return fallback
  try { return JSON.parse(str) } catch { return fallback }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useBackendAlertsMirror(backendOnline: boolean): BackendAlertsMirrorState & {
  refreshBackendAlerts: () => Promise<void>
} {
  const [state, setState] = useState<BackendAlertsMirrorState>({
    enabled: isBackendEnabled(),
    loading: false,
    alerts: [],
    totalCount: 0,
    pendingCount: 0,
    resolvedCount: 0,
    workerCreatedCount: 0,
    confirmedCount: 0,
    failedCount: 0,
    unknownCount: 0,
    workerStatuses: { patternWorker: null, resolutionWorker: null, liveMonitor: null },
    lastFetchedAt: null,
    error: null,
  })
  const fetchedRef = useRef(false)

  const refreshBackendAlerts = useCallback(async () => {
    if (!isBackendEnabled() || !backendOnline) return

    setState(prev => ({ ...prev, loading: true }))

    try {
      const [rawAlerts, patternStatus, resolutionStatus, liveStatus] = await Promise.all([
        getBackendAlerts({ limit: 50 }),
        getBackendPatternWorkerStatus(),
        getBackendResolutionWorkerStatus(),
        getLiveMonitorStatus(),
      ])

      const alerts = (rawAlerts || []).map(adaptBackendAlert)
      const pendingCount = alerts.filter(a => a.status === 'pending').length
      const confirmedCount = alerts.filter(a => a.status === 'confirmed' || a.status === 'confirmed_partial').length
      const failedCount = alerts.filter(a => a.status === 'failed').length
      const unknownCount = alerts.filter(a => a.status === 'unknown').length
      const workerCreatedCount = alerts.filter(a => a.source === 'backend_worker').length

      setState({
        enabled: true,
        loading: false,
        alerts,
        totalCount: alerts.length,
        pendingCount,
        resolvedCount: alerts.length - pendingCount,
        workerCreatedCount,
        confirmedCount,
        failedCount,
        unknownCount,
        workerStatuses: {
          patternWorker: patternStatus ? { enabled: patternStatus.enabled, running: patternStatus.running, lastRunAt: patternStatus.lastRunAt, alertsCreated: patternStatus.totalAlertsCreated || 0, blocked: patternStatus.totalBlocked || 0, duplicatesBlocked: patternStatus.totalDuplicatesBlocked || 0 } : null,
          resolutionWorker: resolutionStatus ? { enabled: resolutionStatus.enabled, running: resolutionStatus.running, lastRunAt: resolutionStatus.lastRunAt, resolved: resolutionStatus.totalResolved || 0, confirmed: resolutionStatus.totalConfirmed || 0, partial: resolutionStatus.totalPartial || 0, failed: resolutionStatus.totalFailed || 0, unknown: resolutionStatus.totalUnknown || 0 } : null,
          liveMonitor: liveStatus ? { enabled: liveStatus.enabled, running: liveStatus.running, lastRunAt: liveStatus.lastRunAt, fixturesSeen: liveStatus.totalFixturesSeen || 0, snapshotsCreated: liveStatus.totalSnapshotsCreated || 0, richSnapshots: liveStatus.totalRichSnapshots || 0 } : null,
        },
        lastFetchedAt: new Date().toISOString(),
        error: null,
      })
    } catch (err) {
      setState(prev => ({ ...prev, loading: false, error: err instanceof Error ? err.message : 'Failed to fetch' }))
    }
  }, [backendOnline])

  useEffect(() => {
    if (backendOnline && !fetchedRef.current && isBackendEnabled()) {
      fetchedRef.current = true
      refreshBackendAlerts()
    }
  }, [backendOnline, refreshBackendAlerts])

  return { ...state, refreshBackendAlerts }
}
