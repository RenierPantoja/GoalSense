/**
 * ESPN Live-First Persistent Worker — B59 Safe Polling Loop with Leases
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs live monitoring sessions persistently. It discovers fixtures, acquires
 * leases, tracks session health, loops to fetch ESPN data, evaluates diffs,
 * and renews heartbeats.
 */
import { env } from '../../../env.js'
import { createRepositories } from '../../../repositories/index.js'
import { guardProviderCall } from '../../localops/livePipelineGuard.service.js'
import { fetchEspnLiveFixtures, fetchEspnSummary, extractEspnStats, extractEspnTimedEvents } from '../../../providers/espn.provider.js'
import { upsertFixture, captureLiveSnapshot } from '../../live/liveMonitor.service.js'
import { discoverLiveFixturesNow } from './espnLiveFixtureDiscovery.service.js'
import { detectSnapshotChanges } from './liveSnapshotDiff.service.js'
import { onLiveSnapshotCaptured, processRecheckQueue, isBridgeEnabled as isLiveRecheckBridgeEnabled } from '../validation/localLiveReevaluationBridge.service.js'
import { acquireFixtureLease, renewFixtureLease, releaseFixtureLease, getWorkerActiveLeasesCount } from './espnLiveFirstLease.service.js'
import { runEspnLiveFirstPostMatchSweeper } from './espnLiveFirstPostMatchSweeper.service.js'
import { publishPublicControlPlaneSnapshot } from '../../controlPlane/controlPlanePublicReadModel.service.js'
import type {
  EspnLiveFirstWorkerRun,
  EspnLiveFirstWorkerStatus,
  EspnLiveFirstWorkerMode,
  StartWorkerOptions,
  EspnLiveFirstWorkerRunSummary
} from './espnLiveFirstWorker.types.js'
import type {
  LiveMonitoringSession,
  LiveMonitoringFixtureState
} from './liveMonitoringSession.types.js'

// In-memory state for the persistent worker
let activeWorkerRun: EspnLiveFirstWorkerRun | null = null
let workerInterval: ReturnType<typeof setInterval> | null = null
let workerSession: LiveMonitoringSession | null = null
let workerFixtureStates = new Map<string, LiveMonitoringFixtureState>()

const DEFAULT_LEASE_TTL_SECONDS = parseInt(process.env.ESPN_LIVE_FIRST_LEASE_TTL_SECONDS || '120')
const DEFAULT_HEARTBEAT_SECONDS = parseInt(process.env.ESPN_LIVE_FIRST_HEARTBEAT_SECONDS || '30')
const MIN_POLL_INTERVAL_SECONDS = parseInt(process.env.ESPN_LIVE_FIRST_MIN_POLL_INTERVAL_SECONDS || '30')

function scheduleActiveWorkerInterval(startedAt: string): void {
  if (!activeWorkerRun) return
  if (workerInterval) clearInterval(workerInterval)

  const maxDuration = activeWorkerRun.maxDurationMinutes * 60 * 1000
  const pollIntervalMs = activeWorkerRun.pollIntervalSeconds * 1000
  const startedAtMs = new Date(startedAt).getTime()

  workerInterval = setInterval(async () => {
    if (!activeWorkerRun) return
    const elapsed = Date.now() - startedAtMs
    if (elapsed > maxDuration) {
      await stopEspnLiveFirstWorker('Max duration reached')
      return
    }
    await executeWorkerTick()
  }, pollIntervalMs)
}

/**
 * Start the persistent ESPN Live-First Worker
 */
export async function startEspnLiveFirstWorker(options: StartWorkerOptions = {}): Promise<{
  success: boolean
  workerRunId?: string
  message: string
}> {
  if (activeWorkerRun) {
    return { success: false, message: `Worker already running: ${activeWorkerRun.id}` }
  }

  const repos = createRepositories()
  const mode = options.mode || 'local_manual'
  const maxFixtures = options.maxFixtures || parseInt(process.env.ESPN_LIVE_FIRST_MAX_FIXTURES || '5')
  const maxDurationMinutes = options.maxDurationMinutes || parseInt(process.env.ESPN_LIVE_FIRST_MAX_SESSION_MINUTES || '180')
  const pollIntervalSeconds = Math.max(
    options.pollIntervalSeconds || parseInt(process.env.ESPN_LIVE_FIRST_POLL_INTERVAL_SECONDS || '45'),
    MIN_POLL_INTERVAL_SECONDS
  )

  try {
    const discovery = await discoverLiveFixturesNow()

    const workerRunId = `ewr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
    const sessionId = `espn_live_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`

    const processId = process.env.WORKER_PROCESS_ID || `process_${process.pid || 'unknown'}`
    const hostId = process.env.HOST_ID || 'local'
    const now = new Date()

    const selectedFixtures = discovery.selected.slice(0, maxFixtures)

    const workerRun: EspnLiveFirstWorkerRun = {
      id: workerRunId,
      startedAt: now.toISOString(),
      status: 'starting',
      mode,
      heartbeatAt: new Date(now.getTime() + DEFAULT_HEARTBEAT_SECONDS * 1000).toISOString(),
      leaseExpiresAt: new Date(now.getTime() + DEFAULT_LEASE_TTL_SECONDS * 1000).toISOString(),
      processId,
      hostId,
      fixtureIds: selectedFixtures.map(f => f.fixtureId),
      sessionId,
      pollIntervalSeconds,
      maxFixtures,
      maxDurationMinutes,
      snapshotsCaptured: 0,
      rechecksTriggered: 0,
      postMatchResolved: 0,
      errors: [],
      warnings: discovery.limitations,
      limitations: [],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    }

    const session: LiveMonitoringSession = {
      id: sessionId,
      startedAt: now.toISOString(),
      status: 'running',
      fixtureIds: workerRun.fixtureIds,
      mode: 'espn_live_first',
      pollIntervalSeconds,
      maxDurationMinutes,
      snapshotsCaptured: 0,
      governanceEvaluations: 0,
      liveRechecks: 0,
      errors: [],
      warnings: [...discovery.limitations],
      limitations: [],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    }

    await repos.intelligence.saveEspnLiveFirstWorkerRun(workerRun)
    await repos.intelligence.saveLiveMonitoringSession(session)

    const fixtureStates = new Map<string, LiveMonitoringFixtureState>()
    for (const selected of selectedFixtures) {
      const state: LiveMonitoringFixtureState = {
        id: `state_${sessionId}_${selected.fixtureId}`,
        sessionId,
        fixtureId: selected.fixtureId,
        snapshotCount: 0,
        lastStatus: selected.status,
        lastMinute: selected.minute,
        lastScore: selected.score,
        eventsDetected: 0,
        rechecksTriggered: 0,
        completed: false,
        limitations: selected.limitations,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      await repos.intelligence.saveLiveMonitoringFixtureState(state)
      fixtureStates.set(selected.fixtureId, state)

      await acquireFixtureLease(selected.fixtureId, sessionId, workerRunId)
    }

    workerRun.status = 'running'
    await repos.intelligence.updateEspnLiveFirstWorkerRun(workerRunId, { status: 'running' })

    activeWorkerRun = workerRun
    workerSession = session
    workerFixtureStates = fixtureStates

    scheduleActiveWorkerInterval(workerRun.startedAt)

    // Execute first tick immediately
    await executeWorkerTick()

    return {
      success: true,
      workerRunId,
      message: `Started worker ${workerRunId} monitoring ${selectedFixtures.length} fixtures`
    }

  } catch (error: any) {
    return {
      success: false,
      message: `Failed to start worker: ${error?.message || 'unknown'}`
    }
  }
}

/**
 * Execute a single tick of the worker loop
 */
async function executeWorkerTick(): Promise<void> {
  if (!activeWorkerRun || !workerSession) return

  const repos = createRepositories()
  const now = new Date()

  try {
    // 1. Fetch live data
    const espnResult = await fetchEspnLiveFixtures()
    if (!espnResult.success) {
      activeWorkerRun.errors.push(`ESPN fetch failed: ${espnResult.error || 'unknown'}`)
      return
    }

    const allFixtures = espnResult.fixtures

    // 2. Process each monitored fixture
    for (const fixtureId of activeWorkerRun.fixtureIds) {
      const state = workerFixtureStates.get(fixtureId)
      if (!state || state.completed) continue

      // Renew lease
      const renew = await renewFixtureLease(fixtureId, activeWorkerRun.id)
      if (!renew.success) {
        activeWorkerRun.warnings.push(`Lost lease for ${fixtureId}: ${renew.reason}`)
        continue // Skip this fixture if we lost the lease
      }

      const current = allFixtures.find(f => f.providerFixtureId === fixtureId)
      if (!current) {
        state.limitations.push('Fixture no longer in ESPN feed')
        continue
      }

      // Check if finished
      if (process.env.ESPN_LIVE_FIRST_STOP_ON_FULL_TIME === 'true' &&
         (current.status === 'FT' || current.status === 'AET' || current.status === 'PEN')) {

        state.completed = true
        state.limitations.push(`Match completed: ${current.status}`)
        state.lastStatus = current.status
        state.lastMinute = current.minute
        state.lastScore = { home: current.scoreHome, away: current.scoreAway }

        await repos.intelligence.updateLiveMonitoringFixtureState(state.id, {
          completed: true,
          lastStatus: state.lastStatus,
          lastMinute: state.lastMinute,
          lastScore: state.lastScore,
          limitations: state.limitations,
          updatedAt: new Date().toISOString()
        })

        // Post match cleanup
        await releaseFixtureLease(fixtureId, activeWorkerRun.id)

        // Trigger post match sweeper internally
        const postMatchResult = await runEspnLiveFirstPostMatchSweeper(fixtureId, workerSession.id)
        if (postMatchResult.success) {
          activeWorkerRun.postMatchResolved++
        }

        continue
      }

      // Record snapshot
      const dbFixtureId = await upsertFixture(current)
      const previousSnapshot = await repos.liveSnapshots.findLatestByFixture(dbFixtureId)

      let enrichedStats = null
      let enrichedEvents = null
      const enableEnrichment = process.env.SUMMARY_ENRICHMENT_ENABLED === 'true'

      if (enableEnrichment) {
        const enrichmentBudget = guardProviderCall('espn', 'fixture_detail')
        if (!enrichmentBudget.blockedByProviderBudget) {
          const summaryResult = await fetchEspnSummary(fixtureId)
          if (summaryResult.success && summaryResult.data) {
            enrichedStats = extractEspnStats(summaryResult.data)
            enrichedEvents = extractEspnTimedEvents(summaryResult.data, current.homeTeam, current.awayTeam)
          }
        }
      }

      const snapshotCreated = await captureLiveSnapshot(dbFixtureId, current, enrichedStats, enrichedEvents)

      if (snapshotCreated) {
        activeWorkerRun.snapshotsCaptured++
        workerSession.snapshotsCaptured++
        state.snapshotCount++
        state.firstSnapshotAt = state.firstSnapshotAt || new Date().toISOString()
        state.lastSnapshotAt = new Date().toISOString()
        state.lastStatus = current.status
        state.lastMinute = current.minute
        state.lastScore = { home: current.scoreHome, away: current.scoreAway }

        const newSnapshot = await repos.liveSnapshots.findLatestByFixture(dbFixtureId)

        if (newSnapshot && previousSnapshot) {
          const diff = detectSnapshotChanges(
            {
              id: String(newSnapshot.id),
              minute: newSnapshot.minute,
              status: newSnapshot.status,
              scoreHome: newSnapshot.scoreHome,
              scoreAway: newSnapshot.scoreAway,
              statsJson: newSnapshot.statsJson,
              eventsJson: newSnapshot.eventsJson,
              createdAt: newSnapshot.createdAt || new Date().toISOString()
            },
            {
              id: String(previousSnapshot.id),
              minute: previousSnapshot.minute,
              status: previousSnapshot.status,
              scoreHome: previousSnapshot.scoreHome,
              scoreAway: previousSnapshot.scoreAway,
              statsJson: previousSnapshot.statsJson,
              eventsJson: previousSnapshot.eventsJson,
              createdAt: previousSnapshot.createdAt || new Date().toISOString()
            },
            dbFixtureId
          )

          state.eventsDetected += diff.detectedChanges.length

          if (diff.shouldTriggerGovernanceRecheck && isLiveRecheckBridgeEnabled()) {
            try {
              const recheckResult = await onLiveSnapshotCaptured(newSnapshot, previousSnapshot)
              if (recheckResult.enqueued.length > 0) {
                await processRecheckQueue()
                state.rechecksTriggered += recheckResult.enqueued.length
                activeWorkerRun.rechecksTriggered += recheckResult.enqueued.length
                workerSession.liveRechecks += recheckResult.enqueued.length
              }
            } catch (recheckError: any) {
              activeWorkerRun.warnings.push(`Recheck failed for ${fixtureId}: ${recheckError?.message}`)
            }
          }

          workerSession.governanceEvaluations++
        }

        await repos.intelligence.updateLiveMonitoringFixtureState(state.id, {
          snapshotCount: state.snapshotCount,
          lastSnapshotAt: state.lastSnapshotAt,
          lastStatus: state.lastStatus,
          lastMinute: state.lastMinute,
          lastScore: state.lastScore,
          eventsDetected: state.eventsDetected,
          rechecksTriggered: state.rechecksTriggered,
          updatedAt: new Date().toISOString()
        })
      }
    }

    // Update worker state
    activeWorkerRun.heartbeatAt = new Date(now.getTime() + DEFAULT_HEARTBEAT_SECONDS * 1000).toISOString()
    activeWorkerRun.leaseExpiresAt = new Date(now.getTime() + DEFAULT_LEASE_TTL_SECONDS * 1000).toISOString()
    activeWorkerRun.updatedAt = new Date().toISOString()

    await repos.intelligence.updateEspnLiveFirstWorkerRun(activeWorkerRun.id, {
      snapshotsCaptured: activeWorkerRun.snapshotsCaptured,
      rechecksTriggered: activeWorkerRun.rechecksTriggered,
      postMatchResolved: activeWorkerRun.postMatchResolved,
      heartbeatAt: activeWorkerRun.heartbeatAt,
      leaseExpiresAt: activeWorkerRun.leaseExpiresAt,
      errors: activeWorkerRun.errors,
      warnings: activeWorkerRun.warnings,
      updatedAt: activeWorkerRun.updatedAt
    })

    // Stop if all fixtures completed
    const activeLeasesCount = await getWorkerActiveLeasesCount(activeWorkerRun.id)
    if (activeLeasesCount === 0 && Array.from(workerFixtureStates.values()).every(s => s.completed)) {
      await stopEspnLiveFirstWorker('All fixtures completed')
    }

    // B66: publish sanitized public control-plane snapshot (throttled, non-fatal).
    await publishPublicControlPlaneSnapshot().catch(() => { /* never break the worker */ })

  } catch (error: any) {
    activeWorkerRun.errors.push(`Worker tick error: ${error?.message || 'unknown'}`)
    if (activeWorkerRun.errors.length >= 10) {
      await stopEspnLiveFirstWorker('Too many errors')
    }
  }
}

/**
 * Stop the worker gracefully
 */
export async function stopEspnLiveFirstWorker(reason?: string): Promise<{
  success: boolean
  message: string
}> {
  if (!activeWorkerRun) {
    return { success: false, message: 'No active worker running' }
  }

  const repos = createRepositories()
  const runId = activeWorkerRun.id

  try {
    if (workerInterval) {
      clearInterval(workerInterval)
      workerInterval = null
    }

    // Release all leases held by this worker
    for (const fixtureId of activeWorkerRun.fixtureIds) {
      await releaseFixtureLease(fixtureId, runId)
    }

    const status: EspnLiveFirstWorkerStatus = activeWorkerRun.errors.length > 0
      ? 'completed_with_warnings'
      : 'completed'

    await repos.intelligence.updateEspnLiveFirstWorkerRun(runId, {
      status,
      stoppedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })

    if (workerSession) {
      await repos.intelligence.updateLiveMonitoringSession(workerSession.id, {
        status: status === 'completed_with_warnings' ? 'completed_with_warnings' : 'completed',
        endedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
    }

    activeWorkerRun = null
    workerSession = null
    workerFixtureStates.clear()

    // B66: final forced publish so the control plane reflects the stopped state.
    await publishPublicControlPlaneSnapshot({ force: true }).catch(() => {})

    return {
      success: true,
      message: `Worker stopped: ${reason || 'manual stop'}`
    }
  } catch (error: any) {
    return {
      success: false,
      message: `Failed to stop worker: ${error?.message || 'unknown'}`
    }
  }
}

/**
 * Get active worker status
 */
export function getActiveWorkerStatus() {
  if (!activeWorkerRun) return null
  return {
    run: activeWorkerRun,
    session: workerSession,
    fixtures: Array.from(workerFixtureStates.values())
  }
}

export async function startWorkerRun(options: StartWorkerOptions = {}) {
  return startEspnLiveFirstWorker(options)
}

export async function stopWorkerRun(workerRunId: string) {
  if (activeWorkerRun?.id === workerRunId) {
    return stopEspnLiveFirstWorker('Stop requested by workerRunId')
  }

  const repos = createRepositories()
  const run = await repos.intelligence.getEspnLiveFirstWorkerRun(workerRunId)
  if (!run) return { success: false, message: `Worker run ${workerRunId} not found` }

  for (const fixtureId of run.fixtureIds) {
    await releaseFixtureLease(fixtureId, workerRunId).catch(() => null)
  }

  await repos.intelligence.updateEspnLiveFirstWorkerRun(workerRunId, {
    status: 'cancelled',
    stoppedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    warnings: [...(run.warnings || []), 'Stopped from a process without in-memory ownership'],
  })

  if (run.sessionId) {
    await repos.intelligence.updateLiveMonitoringSession(run.sessionId, {
      status: 'cancelled',
      endedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).catch(() => null)
  }

  return { success: true, message: `Worker run ${workerRunId} marked cancelled and leases released` }
}

export async function pauseWorkerRun(workerRunId: string) {
  if (!activeWorkerRun || activeWorkerRun.id !== workerRunId) {
    return { success: false, message: 'Worker is not active in this process' }
  }
  if (workerInterval) {
    clearInterval(workerInterval)
    workerInterval = null
  }
  activeWorkerRun.status = 'paused'
  await createRepositories().intelligence.updateEspnLiveFirstWorkerRun(workerRunId, {
    status: 'paused',
    updatedAt: new Date().toISOString(),
  })
  return { success: true, message: `Worker run ${workerRunId} paused` }
}

export async function resumeWorkerRun(workerRunId: string) {
  const repos = createRepositories()
  const run = await repos.intelligence.getEspnLiveFirstWorkerRun(workerRunId)
  if (!run) return { success: false, message: `Worker run ${workerRunId} not found` }
  if (!run.sessionId) return { success: false, message: `Worker run ${workerRunId} has no persisted session` }

  const session = await repos.intelligence.getLiveMonitoringSession(run.sessionId)
  if (!session) return { success: false, message: `Session ${run.sessionId} not found` }

  const states = await repos.intelligence.listLiveMonitoringFixtureStates(session.id, 500)
  activeWorkerRun = {
    ...run,
    status: 'running',
    warnings: [...(run.warnings || []), 'Worker run resumed from persisted state'],
    updatedAt: new Date().toISOString(),
  }
  workerSession = { ...session, status: 'running', updatedAt: new Date().toISOString() }
  workerFixtureStates = new Map(states.map(state => [state.fixtureId, state]))

  await repos.intelligence.updateEspnLiveFirstWorkerRun(workerRunId, {
    status: 'recovered',
    warnings: activeWorkerRun.warnings,
    updatedAt: activeWorkerRun.updatedAt,
  })
  await repos.intelligence.updateLiveMonitoringSession(session.id, {
    status: 'running',
    warnings: [...(session.warnings || []), 'Session reattached to persistent worker'],
    updatedAt: new Date().toISOString(),
  })

  for (const state of states) {
    if (!state.completed) {
      await acquireFixtureLease(state.fixtureId, session.id, workerRunId).catch(() => null)
    }
  }

  scheduleActiveWorkerInterval(activeWorkerRun.startedAt)
  await executeWorkerTick()
  return { success: true, message: `Worker run ${workerRunId} resumed with ${states.length} fixture states` }
}

export async function tickWorkerRun(workerRunId: string) {
  if (!activeWorkerRun || activeWorkerRun.id !== workerRunId) {
    return { success: false, message: 'Worker is not active in this process' }
  }
  await executeWorkerTick()
  return { success: true, message: `Worker run ${workerRunId} tick completed` }
}

export async function heartbeatWorkerRun(workerRunId: string) {
  const repos = createRepositories()
  const run = await repos.intelligence.getEspnLiveFirstWorkerRun(workerRunId)
  if (!run) return { success: false, message: `Worker run ${workerRunId} not found` }

  const now = new Date()
  const patch = {
    heartbeatAt: now.toISOString(),
    leaseExpiresAt: new Date(now.getTime() + DEFAULT_LEASE_TTL_SECONDS * 1000).toISOString(),
    updatedAt: now.toISOString(),
  }

  await repos.intelligence.updateEspnLiveFirstWorkerRun(workerRunId, patch)
  if (activeWorkerRun?.id === workerRunId) activeWorkerRun = { ...activeWorkerRun, ...patch }
  return { success: true, message: `Worker run ${workerRunId} heartbeat updated` }
}

export async function buildWorkerRunSummary(workerRunId: string): Promise<EspnLiveFirstWorkerRunSummary | null> {
  const run = await createRepositories().intelligence.getEspnLiveFirstWorkerRun(workerRunId)
  if (!run) return null
  const end = run.stoppedAt ? new Date(run.stoppedAt) : new Date()
  const start = new Date(run.startedAt)
  return {
    workerRunId: run.id,
    status: run.status,
    mode: run.mode,
    durationMinutes: Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000)),
    startedAt: run.startedAt,
    stoppedAt: run.stoppedAt,
    heartbeatAt: run.heartbeatAt,
    processId: run.processId,
    hostId: run.hostId,
    fixtures: run.fixtureIds.length,
    snapshots: run.snapshotsCaptured,
    rechecks: run.rechecksTriggered,
    postMatchResolved: run.postMatchResolved,
    errors: run.errors,
    warnings: run.warnings,
    limitations: run.limitations,
  }
}
