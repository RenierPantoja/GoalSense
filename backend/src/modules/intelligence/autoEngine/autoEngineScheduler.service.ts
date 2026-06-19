/**
 * Auto Engine Scheduler (Phase B19) — disabled by default.
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs the opportunity scan periodically ONLY when ENABLE_AUTO_ENGINE=true AND
 * ENABLE_AUTO_ENGINE_SCHEDULER=true. Never runs in tests, never creates alerts,
 * never throws at startup. Persists opportunities only when WRITE=true.
 */
import { env } from '../../../env.js'
import { runAutoEngineScan, isAutoEngineEnabled, isAutoEngineSchedulerEnabled } from './autoEngine.service.js'

let timer: NodeJS.Timeout | null = null
let running = false
let lastRunAt: string | null = null

export function startAutoEngineScheduler(): void {
  if (!isAutoEngineEnabled() || !isAutoEngineSchedulerEnabled()) {
    console.log('[AutoEngine] scheduler disabled (set ENABLE_AUTO_ENGINE=true AND ENABLE_AUTO_ENGINE_SCHEDULER=true to enable).')
    return
  }
  if (timer) return
  const intervalMs = Math.max(30000, env.AUTO_ENGINE_INTERVAL_MS)
  console.log(`[AutoEngine] scheduler enabled — every ${Math.round(intervalMs / 1000)}s (write=${String(env.ENABLE_AUTO_ENGINE_WRITE)}).`)
  timer = setInterval(() => { void tick() }, intervalMs)
  if (typeof timer.unref === 'function') timer.unref()
}

export function stopAutoEngineScheduler(): void {
  if (timer) { clearInterval(timer); timer = null }
}

async function tick(): Promise<void> {
  if (running) { console.log('[AutoEngine] previous scan still running — skipping.'); return }
  running = true
  try {
    const run = await runAutoEngineScan({ persist: true })
    lastRunAt = new Date().toISOString()
    console.log(`[AutoEngine] scan ${run.status}: ${run.fixturesScanned} fixtures, ${run.opportunitiesFound} opps (${run.strong} strong / ${run.watch} watch / ${run.blocked} blocked).`)
  } catch (e: any) {
    console.warn(`[AutoEngine] scan failed (non-fatal): ${e?.message || e}`)
  } finally {
    running = false
  }
}

export function getAutoEngineSchedulerState(): { enabled: boolean; running: boolean; lastRunAt: string | null } {
  return { enabled: isAutoEngineEnabled() && isAutoEngineSchedulerEnabled(), running, lastRunAt }
}
