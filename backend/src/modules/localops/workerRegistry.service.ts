/**
 * Worker Registry (Phase B30) — observe + pause/resume local workers at runtime.
 * ─────────────────────────────────────────────────────────────────────────────
 * Wraps the existing start/stop functions. Pause = stop the interval (env stays
 * unchanged); resume = start again (only if the env flag allows). Runtime pause
 * NEVER mutates env. Workers without a stop function report `pausable: false`.
 */
import { env } from '../../env.js'
import { startLiveMonitorWorker, stopLiveMonitorWorker, getLiveMonitorStatus } from '../../workers/liveMonitor.worker.js'
import { startPatternEvaluationWorker, stopPatternEvaluationWorker, getPatternWorkerStatus } from '../../workers/patternEvaluation.worker.js'
import { startAlertResolutionWorker, stopAlertResolutionWorker, getResolutionWorkerStatus } from '../../workers/alertResolution.worker.js'
import { getSchedulerState } from '../intelligence/learning/learningAggregationScheduler.service.js'
import { getAutoEngineSchedulerState } from '../intelligence/autoEngine/autoEngineScheduler.service.js'
import { getAutoEngineLearningSchedulerState } from '../intelligence/autoEngine/autoEngineLearningScheduler.service.js'
import { startDynamicFixtureAttachScheduler, stopDynamicFixtureAttachScheduler, getDynamicAttachSchedulerState } from '../validation/liveValidationDynamicAttach.scheduler.js'
import { getGuardMetrics } from './livePipelineGuard.service.js'

const flag = (v: unknown) => String(v).toLowerCase() === 'true'

interface WorkerEntry {
  name: string
  enabledByEnv: () => boolean
  status: () => any
  start?: () => void
  stop?: () => void
  writesEnabled: boolean
  dangerous: boolean
  recommendedLocalState: 'off' | 'limited' | 'on'
}

const paused = new Set<string>()

const WORKERS: WorkerEntry[] = [
  { name: 'liveMonitor', enabledByEnv: () => flag(env.LIVE_WORKER_ENABLED), status: getLiveMonitorStatus, start: startLiveMonitorWorker, stop: stopLiveMonitorWorker, writesEnabled: true, dangerous: false, recommendedLocalState: 'limited' },
  { name: 'patternEvaluation', enabledByEnv: () => flag(env.PATTERN_WORKER_ENABLED), status: getPatternWorkerStatus, start: startPatternEvaluationWorker, stop: stopPatternEvaluationWorker, writesEnabled: true, dangerous: true, recommendedLocalState: 'off' },
  { name: 'alertResolution', enabledByEnv: () => flag(env.RESOLUTION_WORKER_ENABLED), status: getResolutionWorkerStatus, start: startAlertResolutionWorker, stop: stopAlertResolutionWorker, writesEnabled: true, dangerous: false, recommendedLocalState: 'off' },
  { name: 'learningScheduler', enabledByEnv: () => flag(env.ENABLE_LEARNING_AGGREGATION_SCHEDULER), status: getSchedulerState, writesEnabled: true, dangerous: false, recommendedLocalState: 'off' },
  { name: 'autoEngineScheduler', enabledByEnv: () => flag(env.ENABLE_AUTO_ENGINE_SCHEDULER), status: getAutoEngineSchedulerState, writesEnabled: true, dangerous: true, recommendedLocalState: 'off' },
  { name: 'autoEngineLearningScheduler', enabledByEnv: () => flag(env.ENABLE_AUTO_ENGINE_LEARNING_SCHEDULER), status: getAutoEngineLearningSchedulerState, writesEnabled: true, dangerous: false, recommendedLocalState: 'off' },
  { name: 'dynamicFixtureAttach', enabledByEnv: () => flag(env.ENABLE_LIVE_VALIDATION_DYNAMIC_ATTACH), status: getDynamicAttachSchedulerState, start: startDynamicFixtureAttachScheduler, stop: stopDynamicFixtureAttachScheduler, writesEnabled: true, dangerous: false, recommendedLocalState: 'limited' },
]

function entry(name: string): WorkerEntry | undefined { return WORKERS.find(w => w.name === name) }

function safeStatus(w: WorkerEntry): any {
  try { return w.status() } catch (e: any) { return { error: String(e?.message || e).slice(0, 80) } }
}

export function listWorkers() {
  return WORKERS.map(w => {
    const s = safeStatus(w)
    return {
      name: w.name,
      enabledByEnv: w.enabledByEnv(),
      running: !!s?.running,
      paused: paused.has(w.name),
      pausable: !!w.stop,
      lastRunAt: s?.lastRunAt ?? null,
      lastSuccessAt: s?.lastSuccessAt ?? null,
      lastErrorSafeMessage: s?.lastError ? String(s.lastError).slice(0, 120) : null,
      writesEnabled: w.writesEnabled,
      dangerous: w.dangerous,
      recommendedLocalState: w.recommendedLocalState,
    }
  })
}

export function pauseWorker(name: string): { ok: boolean; reason: string | null } {
  const w = entry(name)
  if (!w) return { ok: false, reason: 'unknown_worker' }
  if (!w.stop) return { ok: false, reason: 'not_pausable' }
  try { w.stop(); paused.add(name); return { ok: true, reason: null } }
  catch (e: any) { return { ok: false, reason: String(e?.message || e).slice(0, 80) } }
}

export function resumeWorker(name: string): { ok: boolean; reason: string | null } {
  const w = entry(name)
  if (!w) return { ok: false, reason: 'unknown_worker' }
  if (!w.start) return { ok: false, reason: 'not_resumable' }
  if (!w.enabledByEnv()) return { ok: false, reason: 'disabled_by_env' }
  try { w.start(); paused.delete(name); return { ok: true, reason: null } }
  catch (e: any) { return { ok: false, reason: String(e?.message || e).slice(0, 80) } }
}

/**
 * B31: live pipeline guard runtime summary for the registry view — guard mode,
 * which guards are enabled, retention state, last block timestamps and a
 * recommended action. Pulls live counters from the live pipeline guard.
 */
export function getGuardRuntimeSummary() {
  const m = getGuardMetrics()
  return {
    guardMode: m.guardMode,
    recommendedGuardMode: m.recommendedGuardMode,
    providerGuardEnabled: m.providerGuardEnabled,
    snapshotGuardEnabled: m.snapshotGuardEnabled,
    fixtureCapEnabled: m.fixtureCapEnabled,
    retentionEnabled: m.retentionEnabled,
    retentionDryRun: m.retentionDryRun,
    lastGuardBlockAt: m.lastGuardBlockAt,
    lastSnapshotSkipAt: m.lastSnapshotSkipAt,
    lastProviderBlockAt: m.lastProviderBlockAt,
    recommendedAction: m.recommendedAction,
    generatedAt: m.generatedAt,
  }
}
