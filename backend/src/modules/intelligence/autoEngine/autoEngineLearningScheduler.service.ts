/**
 * Auto Engine Learning Scheduler (Phase B24) — env-gated, disabled by default.
 * ─────────────────────────────────────────────────────────────────────────────
 * Optional periodic recompute of the Auto Engine calibration profile. OFF unless
 * ENABLE_AUTO_ENGINE_LEARNING_SCHEDULER=true. Simple in-process lock prevents
 * overlap. Never runs in tests. Never throws at startup. Observational only —
 * never auto-tunes the engine, never creates alerts, never sends Telegram.
 */
import { env } from '../../../env.js'
import { rebuildAutoEngineLearningProfiles } from './autoEngineLearningAggregator.service.js'

let timer: NodeJS.Timeout | null = null
let running = false
let lastRunAt: string | null = null

export function isAutoEngineLearningSchedulerEnabled(): boolean {
  return String(env.ENABLE_AUTO_ENGINE_LEARNING_SCHEDULER).toLowerCase() === 'true' && env.APP_ENV !== 'test'
}

export function startAutoEngineLearningScheduler(): void {
  if (!isAutoEngineLearningSchedulerEnabled()) {
    console.log('[AutoEngineLearningScheduler] disabled (set ENABLE_AUTO_ENGINE_LEARNING_SCHEDULER=true to enable).')
    return
  }
  if (timer) return
  const intervalMs = Math.max(60000, env.AUTO_ENGINE_LEARNING_INTERVAL_MS)
  console.log(`[AutoEngineLearningScheduler] enabled — every ${Math.round(intervalMs / 1000)}s.`)
  timer = setInterval(() => { void tick() }, intervalMs)
  if (typeof timer.unref === 'function') timer.unref()
}

export function stopAutoEngineLearningScheduler(): void {
  if (timer) { clearInterval(timer); timer = null }
}

async function tick(): Promise<void> {
  if (running) { console.log('[AutoEngineLearningScheduler] previous run still in progress — skipping.'); return }
  running = true
  try {
    const { run } = await rebuildAutoEngineLearningProfiles({})
    lastRunAt = new Date().toISOString()
    console.log(`[AutoEngineLearningScheduler] run ${run.status}: ${run.sampleSize} resolved promoted, ${run.recommendations} recs.`)
  } catch (e: any) {
    console.warn(`[AutoEngineLearningScheduler] run failed (non-fatal): ${e?.message || e}`)
  } finally {
    running = false
  }
}

export function getAutoEngineLearningSchedulerState(): { enabled: boolean; running: boolean; lastRunAt: string | null } {
  return { enabled: isAutoEngineLearningSchedulerEnabled(), running, lastRunAt }
}
