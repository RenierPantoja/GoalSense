/**
 * Pre-Match Acquisition Scheduler (B40) — optional, OFF by default.
 * ─────────────────────────────────────────────────────────────────────────────
 * Flag-gated unref interval that runs today's acquisition. Requires BOTH
 * ENABLE_PRE_MATCH_ACQUISITION and ENABLE_PRE_MATCH_ACQUISITION_SCHEDULER and
 * PRE_MATCH_ACQUISITION_MODE=scheduled. Never keeps the process alive; non-fatal.
 */
import { env } from '../../env.js'
import { runAcquisitionForToday, isAcquisitionEnabled } from './preMatchAcquisitionRunner.service.js'

const flag = (v: unknown) => String(v).toLowerCase() === 'true'
let timer: ReturnType<typeof setInterval> | null = null
let lastRunAt: string | null = null

export function isSchedulerEnabled(): boolean {
  return isAcquisitionEnabled() && flag(env.ENABLE_PRE_MATCH_ACQUISITION_SCHEDULER) && String(env.PRE_MATCH_ACQUISITION_MODE) === 'scheduled'
}

export function startPreMatchAcquisitionScheduler(): void {
  if (timer || !isSchedulerEnabled()) {
    if (!isSchedulerEnabled()) console.log('[B40] pre-match acquisition scheduler disabled (manual-first).')
    return
  }
  const intervalMs = Math.max(60000, Number(env.PRE_MATCH_ACQUISITION_INTERVAL_MS) || 900000)
  timer = setInterval(() => { void runAcquisitionForToday().then(() => { lastRunAt = new Date().toISOString() }).catch(() => {}) }, intervalMs)
  if (typeof (timer as any).unref === 'function') (timer as any).unref()
  console.log(`[B40] pre-match acquisition scheduler started (every ${intervalMs}ms).`)
}

export function stopPreMatchAcquisitionScheduler(): void { if (timer) { clearInterval(timer); timer = null } }
export function getPreMatchAcquisitionSchedulerState() {
  return { enabled: isSchedulerEnabled(), running: !!timer, lastRunAt, mode: String(env.PRE_MATCH_ACQUISITION_MODE) }
}
