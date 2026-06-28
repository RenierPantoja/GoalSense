import { createRepositories } from '../../repositories/index.js'
import {
  detectRuntimeEnvironment,
  explainRuntimeGuardDecision,
  isPersistentWorkerAllowed,
  isReadOnlyControlPlane,
} from './runtimeEnvironmentGuard.service.js'
import { buildWorkerControlPlaneFreshness } from './workerControlPlaneFreshness.service.js'

export async function getLatestWorkerStatusReadModel() {
  const repos = createRepositories()
  const [runs, sessions, leases, recoveryReports, postMatchOutcomes, dailyReports] = await Promise.all([
    repos.intelligence.listEspnLiveFirstWorkerRuns({ limit: 20 }).catch(() => []),
    repos.intelligence.listLiveMonitoringSessions(50).catch(() => []),
    repos.intelligence.listEspnLiveFirstFixtureLeases(200).catch(() => []),
    repos.intelligence.listEspnLiveFirstRecoveryReports(10).catch(() => []),
    repos.intelligence.listLiveFirstPostMatchOutcomes(100).catch(() => []),
    repos.intelligence.listDailyValidationReports(5).catch(() => []),
  ])
  const activeLeases = leases.filter(lease => lease.status === 'active')
  const completedOutcomes = postMatchOutcomes.filter(outcome => outcome.evaluable)
  const recentSessionIds = sessions.slice(0, 20).map(session => session.id)
  const fixtureStatesNested = await Promise.all(
    recentSessionIds.map(sessionId => repos.intelligence.listLiveMonitoringFixtureStates(sessionId, 50).catch(() => [])),
  )
  const fixtureStates = fixtureStatesNested.flat()
  const freshness = buildWorkerControlPlaneFreshness({
    workerRuns: runs,
    sessions,
    fixtureStates,
    dailyReports,
    causalCases: postMatchOutcomes,
    expectedUpdateSeconds: Math.max(30, runs[0]?.pollIntervalSeconds ?? 90),
  })

  return {
    generatedAt: new Date().toISOString(),
    source: 'backend_control_plane_read_model',
    runtime: detectRuntimeEnvironment(),
    readOnly: isReadOnlyControlPlane(),
    persistentWorkerAllowed: isPersistentWorkerAllowed(),
    workerRuns: runs,
    runs,
    activeSessions: sessions.filter(session => session.status === 'running'),
    sessions,
    leases,
    fixtureStates,
    activeLeases,
    freshness,
    latestDailyReport: dailyReports[0] ?? null,
    latestCausalCases: postMatchOutcomes.slice(0, 20),
    latestRecoveryReport: recoveryReports[0] ?? null,
    sessionsRunning: sessions.filter(session => session.status === 'running').length,
    fixturesActive: activeLeases.length,
    orphanSessions: recoveryReports[0]?.orphanedSessionsFound ?? 0,
    completedFixtures: completedOutcomes.length,
    postMatchPending: Math.max(
      0,
      sessions.filter(session => session.status === 'completed' || session.status === 'completed_with_warnings')
        .reduce((sum, session) => sum + session.fixtureIds.length, 0) - postMatchOutcomes.length,
    ),
    postMatchOutcomes,
    limitations: [
      'Read-only control-plane model; does not start workers or long polling loops.',
      'No odds, Telegram, auto-bet, stake, or enforce changes.',
    ],
  }
}

export async function getLatestLiveFirstOperationalSummary() {
  const status = await getLatestWorkerStatusReadModel()
  const latestRun = status.workerRuns[0] ?? null
  return {
    generatedAt: status.generatedAt,
    runtime: status.runtime,
    latestRun,
    activeSessions: status.sessionsRunning,
    activeFixtures: status.fixturesActive,
    leases: status.leases.length,
    latestHeartbeat: latestRun?.heartbeatAt ?? null,
    snapshotsCaptured: latestRun?.snapshotsCaptured ?? 0,
    limitations: status.limitations,
  }
}

export async function getLatestPostMatchLearningSummary() {
  const status = await getLatestWorkerStatusReadModel()
  return {
    generatedAt: status.generatedAt,
    causalCases: status.latestCausalCases,
    evaluableCases: status.latestCausalCases.filter((item: any) => item.evaluable).length,
    notEvaluableCases: status.latestCausalCases.filter((item: any) => !item.evaluable).length,
    latestDailyReport: status.latestDailyReport,
    limitations: [
      'Causal learning is observational and does not apply calibration.',
      'not_evaluable is reported separately from failure.',
    ],
  }
}

export async function getControlPlaneDashboardSummary() {
  const status = await getLatestWorkerStatusReadModel()
  return {
    ...status,
    commandGuard: {
      startWorker: explainRuntimeGuardDecision('start_worker'),
      stopWorker: explainRuntimeGuardDecision('stop_worker'),
      recoverySweep: explainRuntimeGuardDecision('recovery_sweep'),
      postMatchSweeper: explainRuntimeGuardDecision('post_match_sweeper'),
      readStatus: explainRuntimeGuardDecision('read_status'),
    },
  }
}

export async function getControlPlaneReadiness() {
  const status = await getLatestWorkerStatusReadModel()
  return {
    ok: true,
    generatedAt: status.generatedAt,
    frontendReady: true,
    firebaseReadable: status.workerRuns.length > 0 || status.sessions.length > 0 || !!status.latestDailyReport,
    workerCommandAllowed: !status.readOnly,
    persistentWorkerAllowed: status.persistentWorkerAllowed,
    readOnlyControlPlane: status.readOnly,
    latestWorkerRunVisibleFromControlPlane: status.workerRuns.length > 0,
    latestCausalCasesVisibleFromControlPlane: status.latestCausalCases.length > 0,
    latestDailyReportVisibleFromControlPlane: !!status.latestDailyReport,
    limitations: [
      ...(status.limitations ?? []),
      status.readOnly ? 'Start/resume/long-running worker commands are blocked in this runtime.' : 'Worker commands depend on local worker env flags.',
    ],
    nextActions: status.readOnly
      ? ['Use Vercel as UI/control plane.', 'Run ESPN Live-First worker via local or dedicated CLI runtime.']
      : ['Run worker CLI locally when a real live window is available.', 'Use status routes to verify persistence.'],
  }
}
