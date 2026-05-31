/**
 * hybridAlertMerge — combines local and backend alerts for unified display.
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase B10: Visual/operational merge only. Does NOT alter localStorage.
 * DuplicateSignature is the primary merge key.
 */
import type { CommandCenterAlert } from '@/context/AlertsContext'
import type { BackendAlertView } from './useBackendAlertsMirror'

// ─── Types ───────────────────────────────────────────────────────────────────

export type HybridAlertSource = 'local' | 'backend' | 'merged' | 'conflict'

export interface HybridCommandAlert {
  /** Display alert — the one shown in UI */
  id: string
  patternId: string
  patternName: string
  fixtureId: number | string
  homeTeam: string
  awayTeam: string
  competition: string
  status: string
  confidence: number
  signalState: string
  minuteAtTrigger: number | null
  scoreAtTrigger: { home: number; away: number }
  evidences: string[]
  severity: string
  createdAt: string
  resolvedAt?: string
  resolutionReason?: string
  source: HybridAlertSource
  hasConflict: boolean
  conflictFields?: string[]
  /** Original references (not exposed to UI directly) */
  localAlert?: CommandCenterAlert
  backendAlert?: BackendAlertView
}

export interface HybridMergeDiagnostics {
  localCount: number
  backendCount: number
  mergedCount: number
  matchedCount: number
  onlyLocalCount: number
  onlyBackendCount: number
  divergentStatusCount: number
}

export interface HybridAlertMergeResult {
  alerts: HybridCommandAlert[]
  diagnostics: HybridMergeDiagnostics
}

// ─── Merge Key ───────────────────────────────────────────────────────────────

function getLocalMergeKey(alert: CommandCenterAlert): string {
  const minuteBucket = alert.minuteAtTrigger != null ? Math.floor(alert.minuteAtTrigger / 5) * 5 : 0
  return `${alert.patternId}:${alert.fixtureId}:${alert.scoreAtTrigger.home}-${alert.scoreAtTrigger.away}:${minuteBucket}`
}

function getBackendMergeKey(alert: BackendAlertView): string {
  return alert.duplicateSignature || `${alert.patternId}:${alert.fixtureId}:${alert.triggerScoreHome}-${alert.triggerScoreAway}:${alert.triggerMinute != null ? Math.floor(alert.triggerMinute / 5) * 5 : 0}`
}

// ─── Conflict Detection ──────────────────────────────────────────────────────

function detectConflictFields(local: CommandCenterAlert, backend: BackendAlertView): string[] {
  const fields: string[] = []
  if (local.status !== backend.status) fields.push('status')
  if (Math.abs(local.confidence - backend.confidence) > 10) fields.push('confidence')
  return fields
}

// ─── Status Priority ─────────────────────────────────────────────────────────

const STATUS_PRIORITY: Record<string, number> = {
  pending: 0,
  confirmed: 3,
  confirmed_partial: 2,
  failed: 3,
  unknown: 1,
  expired: 1,
}

function chooseDisplayStatus(localStatus: string, backendStatus: string): string {
  // Resolved status wins over pending
  const localPri = STATUS_PRIORITY[localStatus] ?? 0
  const backendPri = STATUS_PRIORITY[backendStatus] ?? 0
  return backendPri >= localPri ? backendStatus : localStatus
}

// ─── Merge ───────────────────────────────────────────────────────────────────

export function mergeLocalAndBackendAlerts(
  localAlerts: CommandCenterAlert[],
  backendAlerts: BackendAlertView[],
): HybridAlertMergeResult {
  const localByKey = new Map<string, CommandCenterAlert>()
  for (const a of localAlerts) {
    localByKey.set(getLocalMergeKey(a), a)
  }

  const backendByKey = new Map<string, BackendAlertView>()
  for (const a of backendAlerts) {
    backendByKey.set(getBackendMergeKey(a), a)
  }

  const merged: HybridCommandAlert[] = []
  const matchedLocalKeys = new Set<string>()
  const matchedBackendKeys = new Set<string>()
  let matchedCount = 0
  let divergentStatusCount = 0

  // Pass 1: Match local alerts with backend by key
  for (const [key, local] of localByKey) {
    const backend = backendByKey.get(key)
    if (backend) {
      matchedLocalKeys.add(key)
      matchedBackendKeys.add(key)
      matchedCount++

      const conflictFields = detectConflictFields(local, backend)
      const hasConflict = conflictFields.length > 0
      if (conflictFields.includes('status')) divergentStatusCount++

      const displayStatus = chooseDisplayStatus(local.status, backend.status)

      merged.push({
        id: local.id,
        patternId: local.patternId,
        patternName: local.patternName,
        fixtureId: local.fixtureId,
        homeTeam: local.homeTeam,
        awayTeam: local.awayTeam,
        competition: local.competition,
        status: displayStatus,
        confidence: Math.max(local.confidence, backend.confidence),
        signalState: backend.signalState || 'unknown',
        minuteAtTrigger: local.minuteAtTrigger,
        scoreAtTrigger: local.scoreAtTrigger,
        evidences: local.evidences,
        severity: local.severity,
        createdAt: local.createdAt,
        resolvedAt: local.resolvedAt,
        resolutionReason: local.resolutionReason,
        source: hasConflict ? 'conflict' : 'merged',
        hasConflict,
        conflictFields: hasConflict ? conflictFields : undefined,
        localAlert: local,
        backendAlert: backend,
      })
    } else {
      // Local only
      merged.push({
        id: local.id,
        patternId: local.patternId,
        patternName: local.patternName,
        fixtureId: local.fixtureId,
        homeTeam: local.homeTeam,
        awayTeam: local.awayTeam,
        competition: local.competition,
        status: local.status,
        confidence: local.confidence,
        signalState: 'unknown',
        minuteAtTrigger: local.minuteAtTrigger,
        scoreAtTrigger: local.scoreAtTrigger,
        evidences: local.evidences,
        severity: local.severity,
        createdAt: local.createdAt,
        resolvedAt: local.resolvedAt,
        resolutionReason: local.resolutionReason,
        source: 'local',
        hasConflict: false,
        localAlert: local,
      })
    }
  }

  // Pass 2: Backend-only alerts
  for (const [key, backend] of backendByKey) {
    if (matchedBackendKeys.has(key)) continue

    merged.push({
      id: backend.id,
      patternId: backend.patternId,
      patternName: backend.patternName,
      fixtureId: backend.fixtureId,
      homeTeam: backend.homeTeam,
      awayTeam: backend.awayTeam,
      competition: backend.competition,
      status: backend.status,
      confidence: backend.confidence,
      signalState: backend.signalState,
      minuteAtTrigger: backend.triggerMinute,
      scoreAtTrigger: { home: backend.triggerScoreHome, away: backend.triggerScoreAway },
      evidences: [],
      severity: 'attention',
      createdAt: backend.createdAt,
      source: 'backend',
      hasConflict: false,
      backendAlert: backend,
    })
  }

  // Sort by createdAt descending
  merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const onlyLocalCount = localAlerts.length - matchedCount
  const onlyBackendCount = backendAlerts.length - matchedCount

  return {
    alerts: merged,
    diagnostics: {
      localCount: localAlerts.length,
      backendCount: backendAlerts.length,
      mergedCount: merged.length,
      matchedCount,
      onlyLocalCount,
      onlyBackendCount,
      divergentStatusCount,
    },
  }
}
