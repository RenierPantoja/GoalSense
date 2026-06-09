/**
 * Alerts Service — persistence-agnostic via the repository layer (Phase E3).
 * Works in both PERSISTENCE_PROVIDER=prisma and =firebase modes.
 * Routes, payloads, dedup and resolution semantics are unchanged.
 */
import { createRepositories } from '../../repositories/index.js'
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
  return repos.alerts.create(input as any, DEFAULT_USER)
}

export async function resolveAlert(alertId: string, input: ResolveAlertInput) {
  // Atomic: set alert.status + create resolution. 'unknown' stays 'unknown'.
  const repos = createRepositories()
  return repos.alertResolutions.resolveAlert(alertId, input.resolutionStatus, {
    resolutionStatus: input.resolutionStatus,
    resolutionType: input.resolutionType ?? null,
    windowMinutes: input.windowMinutes ?? null,
    evidenceJson: input.evidenceJson,
  })
}
