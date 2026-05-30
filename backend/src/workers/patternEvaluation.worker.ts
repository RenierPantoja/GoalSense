/**
 * Pattern Evaluation Worker — evaluates active patterns against live snapshots.
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase B7: Creates alerts when patterns match with sufficient confidence.
 * Controlled by PATTERN_WORKER_ENABLED env variable.
 */
import { env } from '../env.js'
import { runPatternEvaluation, type WorkerRunResult } from '../modules/command/commandEvaluation.service.js'

// ─── State ───────────────────────────────────────────────────────────────────

let running = false
let intervalHandle: ReturnType<typeof setInterval> | null = null
let lastRunAt: string | null = null
let lastSuccessAt: string | null = null
let lastError: string | null = null
let totalRuns = 0
let totalPatternsChecked = 0
let totalFixturesChecked = 0
let totalEvaluations = 0
let totalAlertsCreated = 0
let totalBlocked = 0
let totalDuplicatesBlocked = 0
let consecutiveErrors = 0
const MAX_CONSECUTIVE_ERRORS = 5

// ─── Core Loop ───────────────────────────────────────────────────────────────

async function runOnce(): Promise<WorkerRunResult | null> {
  if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
    const backoffMs = env.PATTERN_WORKER_INTERVAL_MS * 2
    console.warn(`[PatternWorker] ${consecutiveErrors} consecutive errors, backing off ${backoffMs}ms`)
    await new Promise(r => setTimeout(r, backoffMs))
    consecutiveErrors = Math.max(0, consecutiveErrors - 1)
  }

  try {
    const result = await runPatternEvaluation(env.PATTERN_WORKER_MAX_FIXTURES)

    lastRunAt = new Date().toISOString()
    lastSuccessAt = lastRunAt
    lastError = result.errors.length > 0 ? result.errors[0] : null
    totalRuns++
    totalPatternsChecked += result.patternsChecked
    totalFixturesChecked += result.fixturesChecked
    totalEvaluations += result.evaluations
    totalAlertsCreated += result.alertsCreated
    totalBlocked += result.blocked
    totalDuplicatesBlocked += result.duplicatesBlocked
    consecutiveErrors = 0

    if (result.alertsCreated > 0 || result.evaluations > 0) {
      console.log(`[PatternWorker] Run #${totalRuns}: ${result.patternsChecked} patterns × ${result.fixturesChecked} fixtures = ${result.evaluations} evals, ${result.alertsCreated} alerts, ${result.blocked} blocked, ${result.duplicatesBlocked} dupes${result.errors.length > 0 ? `, ${result.errors.length} errors` : ''}`)
    }

    return result
  } catch (err: any) {
    consecutiveErrors++
    lastError = err?.message || 'Unknown error'
    lastRunAt = new Date().toISOString()
    totalRuns++
    console.error(`[PatternWorker] Run #${totalRuns} failed:`, lastError)
    return null
  }
}

// ─── Start/Stop ──────────────────────────────────────────────────────────────

export function startPatternEvaluationWorker() {
  if (env.PATTERN_WORKER_ENABLED !== 'true') {
    console.log('[PatternWorker] Disabled (PATTERN_WORKER_ENABLED != true)')
    return
  }

  if (running) {
    console.log('[PatternWorker] Already running')
    return
  }

  running = true
  console.log(`[PatternWorker] Starting with interval ${env.PATTERN_WORKER_INTERVAL_MS}ms`)

  // Delay first run to let live monitor populate snapshots
  setTimeout(() => { runOnce() }, 5000)

  intervalHandle = setInterval(() => { runOnce() }, env.PATTERN_WORKER_INTERVAL_MS)
}

export function stopPatternEvaluationWorker() {
  if (intervalHandle) {
    clearInterval(intervalHandle)
    intervalHandle = null
  }
  running = false
  console.log('[PatternWorker] Stopped')
}

// ─── Status ──────────────────────────────────────────────────────────────────

export function getPatternWorkerStatus() {
  return {
    enabled: env.PATTERN_WORKER_ENABLED === 'true',
    running,
    lastRunAt,
    lastSuccessAt,
    lastError,
    totalRuns,
    totalPatternsChecked,
    totalFixturesChecked,
    totalEvaluations,
    totalAlertsCreated,
    totalBlocked,
    totalDuplicatesBlocked,
    consecutiveErrors,
    intervalMs: env.PATTERN_WORKER_INTERVAL_MS,
  }
}
