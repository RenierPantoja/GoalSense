/**
 * Live Validation Dynamic Attach Scheduler (Phase B39).
 * ─────────────────────────────────────────────────────────────────────────────
 * Flag-gated interval that periodically attaches newly-live fixtures to running
 * sessions. Uses an unref timer so it never keeps the process alive. Every run is
 * non-fatal and read-only at the provider boundary (no provider calls by default).
 */
import { env } from '../../env.js'
import { runDynamicAttachAllSessions, isDynamicAttachEnabled } from './liveValidationDynamicFixtureAttach.service.js'

let timer: ReturnType<typeof setInterval> | null = null
let lastRunAt: string | null = null
let lastResult: { sessions: number; attached: number } | null = null

export function startDynamicFixtureAttachScheduler(): void {
  if (timer || !isDynamicAttachEnabled()) return
  const intervalMs = Math.max(15000, Number(env.LIVE_VALIDATION_DYNAMIC_ATTACH_INTERVAL_MS) || 60000)
  timer = setInterval(() => {
    void runDynamicAttachAllSessions()
      .then(r => { lastRunAt = new Date().toISOString(); lastResult = r })
      .catch(() => {})
  }, intervalMs)
  if (typeof (timer as any).unref === 'function') (timer as any).unref()
  console.log(`[B39] dynamic fixture attach scheduler started (every ${intervalMs}ms).`)
}

export function stopDynamicFixtureAttachScheduler(): void { if (timer) { clearInterval(timer); timer = null } }

export function getDynamicAttachSchedulerState() {
  return { enabled: isDynamicAttachEnabled(), running: !!timer, lastRunAt, lastResult, intervalMs: Number(env.LIVE_VALIDATION_DYNAMIC_ATTACH_INTERVAL_MS) || 60000 }
}
