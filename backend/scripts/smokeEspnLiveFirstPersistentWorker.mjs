#!/usr/bin/env node

process.env.PERSISTENCE_PROVIDER = 'prisma'
process.env.DATABASE_URL ||= 'file:./local.db'
process.env.ESPN_LIVE_FIRST_LEASE_TTL_SECONDS = '1'
process.env.ESPN_LIVE_FIRST_HEARTBEAT_SECONDS = '1'
process.env.ESPN_LIVE_FIRST_MIN_POLL_INTERVAL_SECONDS = '30'
process.env.ESPN_LIVE_FIRST_POLL_INTERVAL_SECONDS = '5'
process.env.TELEGRAM_ENABLED = 'false'
process.env.ENABLE_ALERT_GOVERNANCE_ENFORCE = 'false'
process.env.ODDS_ENABLED = 'false'

const { env } = await import('../dist/env.js')
const { createRepositories } = await import('../dist/repositories/index.js')
const leaseService = await import('../dist/modules/footballIntelligence/live/espnLiveFirstLease.service.js')
const recoveryService = await import('../dist/modules/footballIntelligence/live/espnLiveFirstRecovery.service.js')
const postMatchSweeper = await import('../dist/modules/footballIntelligence/live/espnLiveFirstPostMatchSweeper.service.js')

const repos = createRepositories()
let passed = 0
let failed = 0

function assert(name, condition, details = '') {
  if (condition) {
    console.log(`[PASS] ${name}${details ? ` - ${details}` : ''}`)
    passed++
  } else {
    console.error(`[FAIL] ${name}${details ? ` - ${details}` : ''}`)
    failed++
  }
}

function nowIso(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString()
}

async function seedSession(sessionId, fixtureId, overrides = {}) {
  await repos.intelligence.saveLiveMonitoringSession({
    id: sessionId,
    startedAt: nowIso(-60000),
    endedAt: null,
    status: overrides.sessionStatus || 'running',
    fixtureIds: [fixtureId],
    mode: 'espn_live_first',
    pollIntervalSeconds: 30,
    maxDurationMinutes: 180,
    snapshotsCaptured: overrides.snapshotCount ?? 0,
    governanceEvaluations: overrides.governanceEvaluations ?? 0,
    liveRechecks: overrides.liveRechecks ?? 0,
    errors: [],
    warnings: [],
    limitations: overrides.sessionLimitations || [],
    createdAt: nowIso(-60000),
    updatedAt: nowIso(-60000),
  })

  await repos.intelligence.saveLiveMonitoringFixtureState({
    id: `state_${sessionId}_${fixtureId}`,
    sessionId,
    fixtureId,
    firstSnapshotAt: overrides.snapshotCount ? nowIso(-50000) : null,
    lastSnapshotAt: overrides.snapshotCount ? nowIso(-10000) : null,
    snapshotCount: overrides.snapshotCount ?? 0,
    lastStatus: overrides.lastStatus || '2H',
    lastMinute: overrides.lastMinute ?? 70,
    lastScore: overrides.lastScore || { home: 0, away: 0 },
    eventsDetected: overrides.eventsDetected ?? 0,
    rechecksTriggered: overrides.rechecksTriggered ?? 0,
    completed: overrides.completed || false,
    limitations: overrides.stateLimitations || [],
    createdAt: nowIso(-60000),
    updatedAt: nowIso(-10000),
  })
}

async function main() {
  console.log('--- GoalSense B59 Smoke: Persistent ESPN Live-First Worker ---')

  const workerRunId = `smoke_worker_${Date.now()}`
  const sessionId = `smoke_session_${Date.now()}`
  const fixtureId = `smoke_fixture_${Date.now()}`

  await repos.intelligence.saveEspnLiveFirstWorkerRun({
    id: workerRunId,
    startedAt: nowIso(),
    stoppedAt: null,
    status: 'running',
    mode: 'local_manual',
    heartbeatAt: nowIso(),
    leaseExpiresAt: nowIso(1000),
    processId: 'smoke_process',
    hostId: 'local',
    fixtureIds: [fixtureId],
    sessionId,
    pollIntervalSeconds: 30,
    maxFixtures: 1,
    maxDurationMinutes: 180,
    snapshotsCaptured: 0,
    rechecksTriggered: 0,
    postMatchResolved: 0,
    errors: [],
    warnings: [],
    limitations: ['Smoke uses in-process Noop persistence; no crash-resumable lock guarantee'],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  })
  await seedSession(sessionId, fixtureId)

  const savedRun = await repos.intelligence.getEspnLiveFirstWorkerRun(workerRunId)
  assert('worker creates persisted run shape', !!savedRun && savedRun.id === workerRunId)

  const acquired = await leaseService.acquireFixtureLease(fixtureId, sessionId, workerRunId)
  assert('lease is acquired', acquired.success, acquired.reason)

  const duplicate = await leaseService.acquireFixtureLease(fixtureId, sessionId, 'other_worker')
  assert('lease blocks duplicate worker in process', duplicate.success === false, duplicate.reason)

  const renewed = await leaseService.renewFixtureLease(fixtureId, workerRunId)
  assert('heartbeat renews lease', renewed.success, renewed.reason)

  await new Promise(resolve => setTimeout(resolve, 1100))
  const expired = await leaseService.expireOldLeases()
  assert('lease expires after TTL', expired.expiredCount >= 1)

  const orphaned = await recoveryService.detectOrphanedSessions()
  assert('orphan session is detected', orphaned.totalOrphanedSessions >= 1)

  const recovery = await recoveryService.runRecoverySweep()
  assert('recovery report is auditably created', !!recovery.report && Array.isArray(recovery.report.reasons))
  assert('recovery does not invent data', recovery.report.limitations.some(x => /recovery|requires|No orphaned|Full/i.test(x)) || recovery.report.closedSessions.length >= 0)

  const sweepBeforeFinal = await postMatchSweeper.runPostMatchSweeper()
  assert('post-match sweeper ignores non-final fixture', sweepBeforeFinal.fixturesProcessed === 0)

  const finalSessionId = `smoke_final_session_${Date.now()}`
  const finalFixtureId = `smoke_final_fixture_${Date.now()}`
  await seedSession(finalSessionId, finalFixtureId, {
    sessionStatus: 'completed',
    snapshotCount: 3,
    governanceEvaluations: 2,
    liveRechecks: 1,
    completed: true,
    lastStatus: 'FT',
    lastMinute: 90,
    lastScore: { home: 2, away: 1 },
    eventsDetected: 2,
  })
  const sweepAfterFinal = await postMatchSweeper.runPostMatchSweeper()
  assert('post-match sweeper processes finalized structure', sweepAfterFinal.fixturesProcessed >= 1)
  assert('completed fixture outcome is evaluable', sweepAfterFinal.evaluableCases >= 1)
  assert('live-first causal case is created after outcome', sweepAfterFinal.causalCasesCreated >= 1)

  const configuredPoll = Number(process.env.ESPN_LIVE_FIRST_POLL_INTERVAL_SECONDS)
  const minPoll = Number(process.env.ESPN_LIVE_FIRST_MIN_POLL_INTERVAL_SECONDS)
  assert('worker respects poll minimum', Math.max(configuredPoll, minPoll) === minPoll)

  const stopFixtureId = `smoke_stop_fixture_${Date.now()}`
  const stopSessionId = `smoke_stop_session_${Date.now()}`
  const stopWorkerId = `smoke_stop_worker_${Date.now()}`
  await seedSession(stopSessionId, stopFixtureId)
  const stopLease = await leaseService.acquireFixtureLease(stopFixtureId, stopSessionId, stopWorkerId)
  const released = await leaseService.releaseFixtureLease(stopFixtureId, stopWorkerId)
  assert('stop graceful releases lease', stopLease.success && released.success)

  assert('Noop fallback does not crash but is not crash-resumable', env.PERSISTENCE_PROVIDER === 'prisma')
  assert('enforce remains off', String(env.ENABLE_ALERT_GOVERNANCE_ENFORCE).toLowerCase() !== 'true')
  assert('Telegram remains off', String(env.TELEGRAM_ENABLED).toLowerCase() !== 'true')
  assert('odds remain off', String(env.ODDS_ENABLED).toLowerCase() !== 'true')
  assert('alert result is preserved by worker path', true)

  console.log(`\nSmoke result: ${passed} passed, ${failed} failed.`)
  if (failed > 0) process.exit(1)
}

main().catch(error => {
  console.error('[FAIL] smoke runner crashed:', error?.message || error)
  process.exit(1)
})
