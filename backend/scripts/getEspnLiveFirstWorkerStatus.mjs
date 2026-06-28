#!/usr/bin/env node

process.env.DATABASE_URL ||= 'file:./local.db'

const { createRepositories } = await import('../dist/repositories/index.js')
const { getActiveWorkerStatus, buildWorkerRunSummary } = await import('../dist/modules/footballIntelligence/live/espnLiveFirstPersistentWorker.service.js')
const repos = createRepositories()

const workerRunId = process.argv[2] || null
const active = getActiveWorkerStatus()
const runs = await repos.intelligence.listEspnLiveFirstWorkerRuns({ limit: 20 }).catch(() => [])
const sessions = await repos.intelligence.listLiveMonitoringSessions(50).catch(() => [])
const leases = await repos.intelligence.listEspnLiveFirstFixtureLeases(200).catch(() => [])
const recoveryReports = await repos.intelligence.listEspnLiveFirstRecoveryReports(10).catch(() => [])
const outcomes = await repos.intelligence.listLiveFirstPostMatchOutcomes(100).catch(() => [])
const summary = workerRunId ? await buildWorkerRunSummary(workerRunId).catch(() => null) : null

console.log(JSON.stringify({
  activeProcessWorker: active,
  requestedSummary: summary,
  workerRuns: runs.map(run => ({
    id: run.id,
    status: run.status,
    mode: run.mode,
    heartbeatAt: run.heartbeatAt,
    fixtures: run.fixtureIds.length,
    snapshots: run.snapshotsCaptured,
    rechecks: run.rechecksTriggered,
    completed: run.status === 'completed' || run.status === 'completed_with_warnings',
    limitations: run.limitations,
  })),
  sessionsRunning: sessions.filter(s => s.status === 'running').length,
  fixturesActive: leases.filter(l => l.status === 'active').length,
  leases: leases.map(l => ({
    fixtureId: l.fixtureId,
    sessionId: l.sessionId,
    workerRunId: l.workerRunId,
    status: l.status,
    heartbeatAt: l.heartbeatAt,
    leaseExpiresAt: l.leaseExpiresAt,
  })),
  orphanSessions: recoveryReports[0]?.orphanedSessionsFound || 0,
  recoveryReports: recoveryReports.length,
  postMatchPending: sessions.filter(s => s.status === 'completed' || s.status === 'completed_with_warnings').length - outcomes.length,
  postMatchOutcomes: outcomes.length,
  safety: {
    odds: 'not_displayed',
    telegram: 'not_sent',
    enforce: 'off',
    autoBet: 'off',
  },
}, null, 2))
