#!/usr/bin/env node

process.env.DATABASE_URL ||= 'file:./local.db'
process.env.GOALSENSE_RUNTIME ||= 'local_worker'
process.env.ENABLE_LOCAL_WORKER_COMMANDS ||= 'true'
process.env.ESPN_LIVE_FIRST_MAX_FIXTURES ||= '2'
process.env.ESPN_LIVE_FIRST_POLL_INTERVAL_SECONDS ||= '45'
process.env.ESPN_LIVE_FIRST_MIN_POLL_INTERVAL_SECONDS ||= '30'
process.env.ESPN_LIVE_FIRST_STOP_ON_FULL_TIME ||= 'true'
process.env.CONTROL_PLANE_DRILL_RUN = 'true'

function argValue(name, fallback) {
  const idx = process.argv.indexOf(name)
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback
}

const base = String(argValue('--control-plane-url', process.env.CONTROL_PLANE_URL || 'https://goal-sense.vercel.app')).replace(/\/$/, '')
const durationMinutes = Number(argValue('--duration', process.env.CONTROL_PLANE_DRILL_MINUTES || '10'))
const maxFixtures = Number(argValue('--max-fixtures', process.env.ESPN_LIVE_FIRST_MAX_FIXTURES || '2'))
const pollIntervalSeconds = Math.max(30, Number(argValue('--poll', process.env.ESPN_LIVE_FIRST_POLL_INTERVAL_SECONDS || '45')))
const statusIntervalSeconds = Math.max(30, Number(argValue('--status-interval', '60')))

async function fetchControlPlane(path) {
  const response = await fetch(`${base}${path}`, { cache: 'no-store' }).catch(() => null)
  if (!response) return { ok: false, status: 0, data: null, cacheControl: null }
  const body = await response.json().catch(() => null)
  return { ok: response.ok, status: response.status, data: body?.data || body, body, cacheControl: response.headers.get('cache-control') }
}

function safeStatus(status) {
  return {
    generatedAt: status?.generatedAt,
    runtime: status?.runtime?.environment || status?.environment,
    readOnly: status?.readOnly ?? status?.runtime?.readOnlyControlPlane ?? status?.isReadOnlyControlPlane,
    workerRuns: status?.workerRuns?.length ?? status?.runs?.length ?? null,
    sessions: status?.sessions?.length ?? null,
    leases: status?.leases?.length ?? null,
    freshness: status?.freshness?.freshnessStatus,
    latestHeartbeat: status?.freshness?.latestWorkerHeartbeatAt || status?.workerRuns?.[0]?.heartbeatAt || status?.runs?.[0]?.heartbeatAt || null,
  }
}

console.log('--- GoalSense B62: Control Plane E2E Drill ---')
console.log(JSON.stringify({ base, durationMinutes, maxFixtures, pollIntervalSeconds, statusIntervalSeconds }, null, 2))

const [health, runtime, cpStatus, readiness] = await Promise.all([
  fetchControlPlane('/api/health'),
  fetchControlPlane('/api/runtime'),
  fetchControlPlane('/api/worker-control-plane/status'),
  fetchControlPlane('/api/worker-control-plane/readiness'),
])

const preflight = {
  health: safeStatus(health.data),
  runtime: safeStatus(runtime.data),
  status: safeStatus(cpStatus.data),
  readiness: safeStatus(readiness.data),
  commandsBlocked: runtime.data?.decisions?.startWorker?.allowed === false && runtime.data?.decisions?.resumeWorker?.allowed === false,
  noStore: [cpStatus.cacheControl, readiness.cacheControl].every(value => String(value || '').includes('no-store')),
}
console.log('[Preflight]', JSON.stringify(preflight, null, 2))

if (!runtime.ok || !cpStatus.ok || !readiness.ok) throw new Error('Control plane preflight failed.')
if (runtime.data?.isReadOnlyControlPlane !== true) throw new Error('Control plane is not read-only.')
if (runtime.data?.isPersistentWorkerAllowed !== false) throw new Error('Vercel persistent worker unexpectedly allowed.')

const worker = await import('../dist/modules/footballIntelligence/live/espnLiveFirstPersistentWorker.service.js')
const recovery = await import('../dist/modules/footballIntelligence/live/espnLiveFirstRecovery.service.js')
const sweeper = await import('../dist/modules/footballIntelligence/live/espnLiveFirstPostMatchSweeper.service.js')
const daily = await import('../dist/modules/footballIntelligence/validation/dailyValidationReport.service.js')
const readModel = await import('../dist/modules/runtime/workerControlPlaneReadModel.service.js')
const comparisonModule = await import('../dist/modules/runtime/controlPlaneStatusComparison.service.js')

const start = await worker.startWorkerRun({
  mode: 'local_manual',
  maxDurationMinutes: durationMinutes,
  maxFixtures,
  pollIntervalSeconds,
})
console.log('[Local worker start]', JSON.stringify(start, null, 2))

const workerRunId = start.workerRunId || null
const comparisons = []
const startedAt = Date.now()
const endAt = startedAt + durationMinutes * 60 * 1000

try {
  while (Date.now() < endAt && workerRunId) {
    await new Promise(resolve => setTimeout(resolve, statusIntervalSeconds * 1000))
    const localStatus = await readModel.getControlPlaneDashboardSummary()
    const controlStatus = await fetchControlPlane('/api/worker-control-plane/status')
    const comparison = comparisonModule.compareLocalWorkerStatusWithControlPlane(localStatus, controlStatus.data)
    comparisons.push({
      checkedAt: new Date().toISOString(),
      local: safeStatus(localStatus),
      vercel: safeStatus(controlStatus.data),
      comparison,
    })
    console.log('[Comparison]', JSON.stringify(comparisons.at(-1), null, 2))
  }
} finally {
  if (workerRunId) {
    const stop = await worker.stopWorkerRun(workerRunId).catch(error => ({ success: false, message: error?.message || 'stop failed' }))
    console.log('[Local worker stop]', JSON.stringify(stop, null, 2))
  }
}

const recoveryResult = await recovery.runRecoverySweep().catch(error => ({ success: false, error: error?.message || 'recovery failed' }))
const postMatchResult = await sweeper.runPostMatchSweeper().catch(error => ({ success: false, error: error?.message || 'post-match failed' }))
const report = await daily.generateDailyValidationReport().catch(error => ({ error: error?.message || 'daily report failed' }))
const finalLocalStatus = await readModel.getControlPlaneDashboardSummary()
const finalControlStatus = await fetchControlPlane('/api/worker-control-plane/status')
const finalReadiness = await fetchControlPlane('/api/worker-control-plane/readiness')
const finalControlRuns = finalControlStatus.data?.workerRuns || finalControlStatus.data?.runs || []
const localWorkerPersisted = !!workerRunId && finalLocalStatus.workerRuns.some(run => run.id === workerRunId)
const localWorkerRunVisibleFromVercel = !!workerRunId && finalControlRuns.some(run => run.id === workerRunId)

const latestComparison = comparisons.at(-1)?.comparison || null
const summary = {
  generatedAt: new Date().toISOString(),
  localWorkerWrote: !!workerRunId,
  workerRunId,
  localWorkerPersisted,
  localWorkerRunVisibleFromVercel,
  vercelRead: finalControlStatus.ok,
  freshness: finalControlStatus.data?.freshness || null,
  blockedCommands: preflight.commandsBlocked,
  comparison: latestComparison,
  recovery: {
    orphanedSessionsFound: recoveryResult.orphanedSessionsFound ?? null,
    recoveredSessions: recoveryResult.recoveredSessions?.length ?? null,
    limitations: recoveryResult.limitations || [],
  },
  postMatch: {
    fixturesProcessed: postMatchResult.fixturesProcessed ?? null,
    causalCasesCreated: postMatchResult.causalCasesCreated ?? null,
    evaluableCases: postMatchResult.evaluableCases ?? null,
    limitations: postMatchResult.limitations || [],
  },
  dailyReport: {
    id: report.id,
    controlPlaneFreshnessStatus: report.controlPlaneFreshnessStatus,
    latestWorkerRunVisibleFromControlPlane: report.latestWorkerRunVisibleFromControlPlane,
    latestCausalCasesVisibleFromControlPlane: report.latestCausalCasesVisibleFromControlPlane,
  },
  readiness: safeStatus(finalReadiness.data),
  warnings: [
    ...(start.success ? [] : [start.message]),
    ...((latestComparison && latestComparison.status !== 'in_sync') ? latestComparison.reasons : []),
  ],
  limitations: [
    'Drill never starts worker commands from Vercel.',
    'If no ESPN live fixtures are available, visibility is still checked and no-live is not a failure.',
    'Post-match only creates evaluable cases when ESPN exposes a reliable final state.',
  ],
}

console.log('[B62 Drill Summary]')
console.log(JSON.stringify(summary, null, 2))
if (!finalControlStatus.ok || !preflight.commandsBlocked) process.exit(1)
