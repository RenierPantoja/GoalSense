/**
 * Learning Aggregation Scheduler (Phase B14) — env-gated, disabled by default.
 * ─────────────────────────────────────────────────────────────────────────────
 * Optional periodic re-aggregation of the B13 learning profiles. OFF unless
 * ENABLE_LEARNING_AGGREGATION_SCHEDULER=true. Simple in-process lock prevents
 * overlap. Never runs in tests. Never throws at startup (failure is logged).
 */
import { env } from '../../../env.js'
import { aggregateAll } from './learningAggregator.service.js'

let timer: NodeJS.Timeout | null = null
let running = false
let lastRunAt: string | null = null

export function isLearningSchedulerEnabled(): boolean {
  return String(env.ENABLE_LEARNING_AGGREGATION_SCHEDULER).toLowerCase() === 'true' && env.APP_ENV !== 'test'
}

export function startLearningAggregationScheduler(): void {
  if (!isLearningSchedulerEnabled()) {
    console.log('[LearningScheduler] disabled (set ENABLE_LEARNING_AGGREGATION_SCHEDULER=true to enable).')
    return
  }
  if (timer) return
  const intervalMs = Math.max(60000, env.LEARNING_AGGREGATION_INTERVAL_MS)
  console.log(`[LearningScheduler] enabled — every ${Math.round(intervalMs / 1000)}s.`)
  timer = setInterval(() => { void tick() }, intervalMs)
  // unref so the scheduler never keeps the process alive on its own.
  if (typeof timer.unref === 'function') timer.unref()
}

export function stopLearningAggregationScheduler(): void {
  if (timer) { clearInterval(timer); timer = null }
}

async function tick(): Promise<void> {
  if (running) { console.log('[LearningScheduler] previous run still in progress — skipping.'); return }
  running = true
  try {
    const run = await aggregateAll({})
    lastRunAt = new Date().toISOString()
    console.log(`[LearningScheduler] run ${run.status}: ${run.patternProfiles} pattern / ${run.competitionProfiles} competition / ${run.teamProfiles} team profiles, ${run.recommendations} recs.`)
  } catch (e: any) {
    console.warn(`[LearningScheduler] run failed (non-fatal): ${e?.message || e}`)
  } finally {
    running = false
  }
}

export function getSchedulerState(): { enabled: boolean; running: boolean; lastRunAt: string | null } {
  return { enabled: isLearningSchedulerEnabled(), running, lastRunAt }
}
