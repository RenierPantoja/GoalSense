/**
 * Alert Resolution Worker — resolves pending alerts using post-trigger snapshots.
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase B8: Conservative, honest. Unknown ≠ failed.
 * Controlled by RESOLUTION_WORKER_ENABLED env variable.
 */
import { env } from '../env.js'
import { resolvePendingAlerts, type ResolutionWorkerResult } from '../modules/command/alertResolution.service.js'

// ─── State ───────────────────────────────────────────────────────────────────

let running = false
let intervalHandle: ReturnType<typeof setInterval> | null = null
let lastRunAt: string | null = null
let lastSuccessAt: string | null = null
let lastError: string | null = null
let totalRuns = 0
let totalResolved = 0
let totalConfirmed = 0
let totalPartial = 0
let totalFailed = 0
let totalUnknown = 0
let totalExpired = 0
let consecutiveErrors = 0
const MAX_CONSECUTIVE_ERRORS = 5

// ─── Core Loop ───────────────────────────────────────────────────────────────

async function runOnce(): Promise<ResolutionWorkerResult | null> {
  if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
    const backoffMs = env.RESOLUTION_WORKER_INTERVAL_MS * 2
    console.warn(`[ResolutionWorker] ${consecutiveErrors} consecutive errors, backing off ${backoffMs}ms`)
    await new Promise(r => setTimeout(r, backoffMs))
    consecutiveErrors = Math.max(0, consecutiveErrors - 1)
  }

  try {
    const result = await resolvePendingAlerts(env.RESOLUTION_WORKER_MAX_ALERTS)

    lastRunAt = new Date().toISOString()
    lastSuccessAt = lastRunAt
    lastError = result.errors.length > 0 ? result.errors[0] : null
    totalRuns++
    totalResolved += result.resolved
    totalConfirmed += result.confirmed
    totalPartial += result.partial
    totalFailed += result.failed
    totalUnknown += result.unknown
    totalExpired += result.expired
    consecutiveErrors = 0

    if (result.resolved > 0) {
      console.log(`[ResolutionWorker] Run #${totalRuns}: ${result.pendingChecked} pending, ${result.resolved} resolved (✓${result.confirmed} ~${result.partial} ✗${result.failed} ?${result.unknown} ⏱${result.expired}), ${result.skipped} skipped${result.errors.length > 0 ? `, ${result.errors.length} errors` : ''}`)
    }

    return result
  } catch (err: any) {
    consecutiveErrors++
    lastError = err?.message || 'Unknown error'
    lastRunAt = new Date().toISOString()
    totalRuns++
    console.error(`[ResolutionWorker] Run #${totalRuns} failed:`, lastError)
    return null
  }
}

// ─── Start/Stop ──────────────────────────────────────────────────────────────

export function startAlertResolutionWorker() {
  if (env.RESOLUTION_WORKER_ENABLED !== 'true') {
    console.log('[ResolutionWorker] Disabled (RESOLUTION_WORKER_ENABLED != true)')
    return
  }

  if (running) return

  running = true
  console.log(`[ResolutionWorker] Starting with interval ${env.RESOLUTION_WORKER_INTERVAL_MS}ms`)

  // Delay first run to let pattern worker create alerts first
  setTimeout(() => { runOnce() }, 10000)

  intervalHandle = setInterval(() => { runOnce() }, env.RESOLUTION_WORKER_INTERVAL_MS)
}

export function stopAlertResolutionWorker() {
  if (intervalHandle) { clearInterval(intervalHandle); intervalHandle = null }
  running = false
  console.log('[ResolutionWorker] Stopped')
}

// ─── Status ──────────────────────────────────────────────────────────────────

export function getResolutionWorkerStatus() {
  return {
    enabled: env.RESOLUTION_WORKER_ENABLED === 'true',
    running,
    lastRunAt,
    lastSuccessAt,
    lastError,
    totalRuns,
    totalResolved,
    totalConfirmed,
    totalPartial,
    totalFailed,
    totalUnknown,
    totalExpired,
    consecutiveErrors,
    intervalMs: env.RESOLUTION_WORKER_INTERVAL_MS,
  }
}
