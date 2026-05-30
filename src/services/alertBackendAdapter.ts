/**
 * alertBackendAdapter — converts between frontend CommandCenterAlert and backend API format.
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase B4: Alerts Backend Sync — preserves all evidence and temporal data.
 */
import type { CommandCenterAlert, CommandAlertStatus } from '@/context/AlertsContext'

// ─── Backend Payloads ────────────────────────────────────────────────────────

export interface BackendAlertPayload {
  patternId: string
  fixtureId: string
  confidence: number
  signalState: string
  triggerMinute: number | null
  triggerScoreHome: number
  triggerScoreAway: number
  evidenceJson: string
  temporalEvidenceJson: string | null
  duplicateSignature: string | null
}

export interface BackendResolvePayload {
  resolutionStatus: string
  resolutionType: string | null
  windowMinutes: number | null
  evidenceJson: string
}

// ─── To Backend ──────────────────────────────────────────────────────────────

export function toBackendAlertPayload(alert: CommandCenterAlert): BackendAlertPayload {
  // Build evidence JSON with full context
  const evidenceData = {
    evidences: alert.evidences,
    patternName: alert.patternName,
    homeTeam: alert.homeTeam,
    awayTeam: alert.awayTeam,
    competition: alert.competition,
    severity: alert.severity,
    triggerSnapshot: alert.triggerSnapshot || null,
  }

  // Build duplicate signature for backend dedup
  const dupSig = buildDuplicateSignature(alert)

  return {
    patternId: alert.patternId,
    fixtureId: String(alert.fixtureId),
    confidence: alert.confidence,
    signalState: 'ready_to_alert',
    triggerMinute: alert.minuteAtTrigger ?? null,
    triggerScoreHome: alert.scoreAtTrigger.home,
    triggerScoreAway: alert.scoreAtTrigger.away,
    evidenceJson: JSON.stringify(evidenceData),
    temporalEvidenceJson: alert.temporalEvidence ? JSON.stringify(alert.temporalEvidence) : null,
    duplicateSignature: dupSig,
  }
}

export function toBackendResolvePayload(alert: CommandCenterAlert): BackendResolvePayload {
  const resolutionEvidence = {
    reason: alert.resolutionReason || null,
    scoreAtResolution: alert.scoreAtResolution || null,
    resolutionStrength: alert.resolutionStrength || null,
    resolutionSnapshot: alert.resolutionSnapshot || null,
  }

  // Map frontend status to backend resolution status
  const statusMap: Record<string, string> = {
    confirmed: 'confirmed',
    confirmed_partial: 'confirmed_partial',
    failed: 'failed',
    unknown: 'unknown',
    expired: 'expired',
  }

  return {
    resolutionStatus: statusMap[alert.status] || 'unknown',
    resolutionType: alert.resolutionStrength || null,
    windowMinutes: alert.resolutionSnapshot?.timeToResolutionMs
      ? Math.round(alert.resolutionSnapshot.timeToResolutionMs / 60000)
      : null,
    evidenceJson: JSON.stringify(resolutionEvidence),
  }
}

// ─── From Backend ────────────────────────────────────────────────────────────

export function fromBackendAlert(raw: any): Partial<CommandCenterAlert> {
  const evidence = safeParseJson(raw.evidenceJson, {})
  const temporal = safeParseJson(raw.temporalEvidenceJson, null)

  return {
    backendId: raw.id,
    patternId: raw.patternId,
    fixtureId: typeof raw.fixtureId === 'string' ? parseInt(raw.fixtureId) || 0 : raw.fixtureId,
    confidence: raw.confidence,
    status: (raw.status || 'pending') as CommandAlertStatus,
    evidences: Array.isArray(evidence.evidences) ? evidence.evidences : [],
    patternName: evidence.patternName || '',
    homeTeam: evidence.homeTeam || '',
    awayTeam: evidence.awayTeam || '',
    competition: evidence.competition || '',
    severity: evidence.severity || 'attention',
    minuteAtTrigger: raw.triggerMinute ?? null,
    scoreAtTrigger: { home: raw.triggerScoreHome || 0, away: raw.triggerScoreAway || 0 },
    triggerSnapshot: evidence.triggerSnapshot || undefined,
    temporalEvidence: temporal || undefined,
    createdAt: raw.createdAt || new Date().toISOString(),
    syncStatus: 'synced',
    lastSyncedAt: new Date().toISOString(),
  }
}

// ─── Duplicate Signature ─────────────────────────────────────────────────────

export function buildDuplicateSignature(alert: CommandCenterAlert): string {
  // Signature: patternId + fixtureId + score + minute (rounded to 5min window)
  const minuteWindow = alert.minuteAtTrigger != null ? Math.floor(alert.minuteAtTrigger / 5) * 5 : 0
  return `${alert.patternId}:${alert.fixtureId}:${alert.scoreAtTrigger.home}-${alert.scoreAtTrigger.away}:${minuteWindow}`
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safeParseJson(str: string | null | undefined, fallback: any): any {
  if (!str) return fallback
  try { return JSON.parse(str) } catch { return fallback }
}
