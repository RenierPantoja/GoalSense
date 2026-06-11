/**
 * Alerts Service — persistence-agnostic via the repository layer (Phase E3).
 * Works in both PERSISTENCE_PROVIDER=prisma and =firebase modes.
 * Routes, payloads, dedup and resolution semantics are unchanged.
 */
import { createRepositories } from '../../repositories/index.js'
import { extractBreakdownKeys } from '../performance/performanceInputAdapter.js'
import type { CreateAlertInput, ResolveAlertInput } from './alert.schemas.js'

const DEFAULT_USER = 'default'
const DUPLICATE_WINDOW_MS = 30 * 60 * 1000 // 30 minutes

export async function listAlerts(filters?: { status?: string; patternId?: string; limit?: number }) {
  const repos = createRepositories()
  return repos.alerts.list({
    userId: DEFAULT_USER,
    status: filters?.status,
    patternId: filters?.patternId,
    limit: filters?.limit || 50,
  })
}

export async function getAlert(id: string) {
  const repos = createRepositories()
  return repos.alerts.findById(id, DEFAULT_USER)
}

export async function findByDuplicateSignature(signature: string) {
  // Find recent alert (last 30 min) with same signature to prevent duplicates.
  const repos = createRepositories()
  return repos.alerts.findByDuplicateSignature(signature, DUPLICATE_WINDOW_MS, DEFAULT_USER)
}

export async function createAlert(input: CreateAlertInput) {
  const repos = createRepositories()
  const created = await repos.alerts.create(input as any, DEFAULT_USER)
  // Incremental performance counter (derivative; idempotent; never block create).
  try {
    const keys = extractBreakdownKeys(created)
    await repos.performance.onAlertCreated({
      alertId: (created as any).id, patternId: (created as any).patternId, userId: DEFAULT_USER,
      confidence: (created as any).confidence ?? 0, ...keys,
    })
  } catch (e: any) {
    console.warn(`[Alerts] counter onAlertCreated failed: ${e?.message || e}`)
  }
  return created
}

export async function resolveAlert(alertId: string, input: ResolveAlertInput) {
  // Atomic: set alert.status + create resolution. 'unknown' stays 'unknown'.
  const repos = createRepositories()
  const resolution = await repos.alertResolutions.resolveAlert(alertId, input.resolutionStatus, {
    resolutionStatus: input.resolutionStatus,
    resolutionType: input.resolutionType ?? null,
    windowMinutes: input.windowMinutes ?? null,
    evidenceJson: input.evidenceJson,
  })
  // Incremental performance counter (derivative; idempotent; never block resolve).
  try {
    const alert = await repos.alerts.findById(alertId, DEFAULT_USER)
    if (alert) {
      await repos.performance.applyResolutionToCounters({
        alertId, patternId: (alert as any).patternId, userId: DEFAULT_USER,
        resolutionStatus: input.resolutionStatus, resolutionType: input.resolutionType ?? null,
      })
    }
  } catch (e: any) {
    console.warn(`[Alerts] counter applyResolution failed for ${alertId}: ${e?.message || e}`)
  }
  return resolution
}
