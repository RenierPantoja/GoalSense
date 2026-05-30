/**
 * Live Monitor Worker — background loop that captures live fixture snapshots.
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase B6: Observation only. Does NOT generate alerts.
 * Controlled by LIVE_WORKER_ENABLED env variable.
 */
import { env } from '../env.js'
import { fetchEspnLiveFixtures } from '../providers/espn.provider.js'
import { processLiveFixtures, recordProviderHealth, type MonitorRunResult } from '../modules/live/liveMonitor.service.js'

// ─── State ───────────────────────────────────────────────────────────────────

let running = false
let intervalHandle: ReturnType<typeof setInterval> | null = null
let lastRunAt: string | null = null
let lastSuccessAt: string | null = null
let lastError: string | null = null
let totalRuns = 0
let totalFixturesSeen = 0
let totalSnapshotsCreated = 0
let totalSummariesFetched = 0
let totalSummariesFailed = 0
let totalRichSnapshots = 0
let totalPartialSnapshots = 0
let totalPoorSnapshots = 0
let consecutiveErrors = 0
const MAX_CONSECUTIVE_ERRORS = 5
const BACKOFF_MULTIPLIER = 2

// ─── Core Loop ───────────────────────────────────────────────────────────────

async function runOnce(): Promise<MonitorRunResult | null> {
  if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
    const backoffMs = env.LIVE_WORKER_INTERVAL_MS * BACKOFF_MULTIPLIER
    console.warn(`[LiveWorker] ${consecutiveErrors} consecutive errors, backing off ${backoffMs}ms`)
    await new Promise(r => setTimeout(r, backoffMs))
    consecutiveErrors = Math.max(0, consecutiveErrors - 1) // Slowly recover
  }

  try {
    // Fetch from ESPN
    const espnResult = await fetchEspnLiveFixtures()

    // Record provider health (non-blocking)
    recordProviderHealth(espnResult).catch(() => { /* non-critical */ })

    if (!espnResult.success && espnResult.fixtures.length === 0) {
      consecutiveErrors++
      lastError = espnResult.error || 'No fixtures returned'
      lastRunAt = new Date().toISOString()
      totalRuns++
      console.log(`[LiveWorker] Run #${totalRuns}: no fixtures (${lastError})`)
      return null
    }

    // Process fixtures
    const result = await processLiveFixtures(espnResult.fixtures)

    // Update state
    lastRunAt = new Date().toISOString()
    lastSuccessAt = lastRunAt
    lastError = result.errors.length > 0 ? result.errors[0] : null
    totalRuns++
    totalFixturesSeen += result.fixturesSeen
    totalSnapshotsCreated += result.snapshotsCreated
    totalSummariesFetched += result.summariesFetched
    totalSummariesFailed += result.summariesFailed
    totalRichSnapshots += result.richSnapshots
    totalPartialSnapshots += result.partialSnapshots
    totalPoorSnapshots += result.poorSnapshots
    consecutiveErrors = 0

    console.log(`[LiveWorker] Run #${totalRuns}: ${result.fixturesSeen} fixtures, ${result.snapshotsCreated} snapshots (${result.richSnapshots} rich, ${result.partialSnapshots} partial, ${result.poorSnapshots} poor), ${result.summariesFetched} summaries${result.errors.length > 0 ? `, ${result.errors.length} errors` : ''}`)

    return result
  } catch (err: any) {
    consecutiveErrors++
    lastError = err?.message || 'Unknown error'
    lastRunAt = new Date().toISOString()
    totalRuns++
    console.error(`[LiveWorker] Run #${totalRuns} failed:`, lastError)
    return null
  }
}

// ─── Start/Stop ──────────────────────────────────────────────────────────────

export function startLiveMonitorWorker() {
  if (env.LIVE_WORKER_ENABLED !== 'true') {
    console.log('[LiveWorker] Disabled (LIVE_WORKER_ENABLED != true)')
    return
  }

  if (running) {
    console.log('[LiveWorker] Already running')
    return
  }

  running = true
  const intervalMs = env.LIVE_WORKER_INTERVAL_MS
  console.log(`[LiveWorker] Starting with interval ${intervalMs}ms`)

  // Run immediately on start
  runOnce()

  intervalHandle = setInterval(() => { runOnce() }, intervalMs)
}

export function stopLiveMonitorWorker() {
  if (intervalHandle) {
    clearInterval(intervalHandle)
    intervalHandle = null
  }
  running = false
  console.log('[LiveWorker] Stopped')
}

// ─── Status ──────────────────────────────────────────────────────────────────

export function getLiveMonitorStatus() {
  return {
    enabled: env.LIVE_WORKER_ENABLED === 'true',
    running,
    lastRunAt,
    lastSuccessAt,
    lastError,
    totalRuns,
    totalFixturesSeen,
    totalSnapshotsCreated,
    totalSummariesFetched,
    totalSummariesFailed,
    totalRichSnapshots,
    totalPartialSnapshots,
    totalPoorSnapshots,
    consecutiveErrors,
    intervalMs: env.LIVE_WORKER_INTERVAL_MS,
    enrichmentEnabled: env.SUMMARY_ENRICHMENT_ENABLED === 'true',
    enrichmentMaxFixtures: env.SUMMARY_ENRICHMENT_MAX_FIXTURES,
  }
}
