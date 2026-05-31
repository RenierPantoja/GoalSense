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
  const evidence = typeof raw.evidenceJson === 'string'
    ? safeParseJson(raw.evidenceJson, {})
    : (raw.evidenceJson || {})
  return {
    id: raw.id || '',
    patternId: raw.patternId || '',
    patternName: evidence.patternName || raw.patternId || 'Unknown',
    fixtureId: raw.fixtureId || '',
    homeTeam: evidence.homeTeam || '',
    awayTeam: evidence.awayTeam || '',
    competition: evidence.competition || '',
    status: raw.status || 'unknown',
    confidence: typeof raw.confidence === 'number' ? raw.confidence : 0,
    signalState: raw.signalState || 'unknown',
    triggerMinute: raw.triggerMinute ?? null,
    triggerScoreHome: raw.triggerScoreHome || 0,
    triggerScoreAway: raw.triggerScoreAway || 0,
    source: evidence.source || 'unknown',
    duplicateSignature: raw.duplicateSignature || null,
    createdAt: raw.createdAt instanceof Date ? raw.createdAt.toISOString() : (raw.createdAt || ''),
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

// ─── Local vs Backend Comparison ─────────────────────────────────────────────

export interface AlertsMirrorDiagnostics {
  localCount: number
  backendCount: number
  matchedCount: number
  onlyLocalCount: number
  onlyBackendCount: number
  divergentStatusCount: number
}

/**
 * Compare local alerts with backend alerts by duplicateSignature.
 * Does NOT merge or alter either source.
 */
export function compareLocalAndBackendAlerts(
  localAlerts: Array<{ id: string; patternId: string; fixtureId: number; status: string; scoreAtTrigger?: { home: number; away: number }; minuteAtTrigger?: number | null }>,
  backendAlerts: BackendAlertView[],
): AlertsMirrorDiagnostics {
  // Build signature for local alerts (same format as backend)
  const localSigs = new Map<string, { id: string; status: string }>()
  for (const a of localAlerts) {
    const minuteBucket = a.minuteAtTrigger != null ? Math.floor(a.minuteAtTrigger / 5) * 5 : 0
    const sig = `${a.patternId}:${a.fixtureId}:${a.scoreAtTrigger?.home ?? 0}-${a.scoreAtTrigger?.away ?? 0}:${minuteBucket}`
    localSigs.set(sig, { id: a.id, status: a.status })
  }

  let matchedCount = 0
  let divergentStatusCount = 0
  const matchedBackendIds = new Set<string>()

  for (const ba of backendAlerts) {
    if (!ba.duplicateSignature) continue
    const local = localSigs.get(ba.duplicateSignature)
    if (local) {
      matchedCount++
      matchedBackendIds.add(ba.id)
      if (local.status !== ba.status) divergentStatusCount++
    }
  }

  const onlyLocalCount = localAlerts.length - matchedCount
  const onlyBackendCount = backendAlerts.length - matchedBackendIds.size

  return {
    localCount: localAlerts.length,
    backendCount: backendAlerts.length,
    matchedCount,
    onlyLocalCount,
    onlyBackendCount,
    divergentStatusCount,
  }
}
