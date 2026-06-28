/**
 * ESPN Live-First Monitoring Runner — B57 Safe Polling Loop
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs live monitoring sessions with ESPN data. Safe polling, session tracking,
 * event detection, and governance recheck integration.
 */
import { env } from '../../../env.js'
import { createRepositories } from '../../../repositories/index.js'
import { guardProviderCall } from '../../localops/livePipelineGuard.service.js'
import { fetchEspnLiveFixtures, fetchEspnSummary, extractEspnStats, extractEspnTimedEvents } from '../../../providers/espn.provider.js'
import { upsertFixture, captureLiveSnapshot } from '../../live/liveMonitor.service.js'
import { discoverLiveFixturesNow } from './espnLiveFixtureDiscovery.service.js'
import { detectSnapshotChanges } from './liveSnapshotDiff.service.js'
import { onLiveSnapshotCaptured, processRecheckQueue, isBridgeEnabled as isLiveRecheckBridgeEnabled } from '../validation/localLiveReevaluationBridge.service.js'
import type {
  LiveMonitoringSession,
  LiveMonitoringFixtureState,
  LiveMonitoringConfig,
  LiveMonitoringResult,
  LiveMonitoringSessionStatus
} from './liveMonitoringSession.types.js'

// Configuration from environment
const getConfig = (): LiveMonitoringConfig => ({
  pollIntervalSeconds: parseInt(process.env.ESPN_LIVE_FIRST_POLL_INTERVAL_SECONDS || '45'),
  minPollIntervalSeconds: parseInt(process.env.ESPN_LIVE_FIRST_MIN_POLL_INTERVAL_SECONDS || '30'),
  maxFixtures: parseInt(process.env.ESPN_LIVE_FIRST_MAX_FIXTURES || '5'),
  maxSessionMinutes: parseInt(process.env.ESPN_LIVE_FIRST_MAX_SESSION_MINUTES || '180'),
  stopOnFullTime: process.env.ESPN_LIVE_FIRST_STOP_ON_FULL_TIME === 'true',
  enableEnrichment: process.env.SUMMARY_ENRICHMENT_ENABLED === 'true',
  maxEnrichmentFixtures: parseInt(process.env.SUMMARY_ENRICHMENT_MAX_FIXTURES || '3')
})

// Active sessions storage (in-memory for now, could move to repository)
const activeSessions = new Map<string, {
  session: LiveMonitoringSession
  fixtureStates: Map<string, LiveMonitoringFixtureState>
  intervalHandle?: ReturnType<typeof setInterval>
}>()

/**
 * Start a new ESPN Live-First monitoring session
 */
export async function startEspnLiveFirstMonitoringSession(): Promise<{
  success: boolean
  sessionId?: string
  message: string
  session?: LiveMonitoringSession
}> {
  const config = getConfig()
  const repos = createRepositories()

  try {
    // Discover live fixtures
    const discovery = await discoverLiveFixturesNow()

    if (discovery.selected.length === 0) {
      return {
        success: false,
        message: `No live fixtures found for monitoring. ${discovery.limitations.join(', ')}`
      }
    }

    // Create session
    const sessionId = `espn_live_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
    const session: LiveMonitoringSession = {
      id: sessionId,
      startedAt: new Date().toISOString(),
      status: 'running',
      fixtureIds: discovery.selected.map(f => f.fixtureId),
      mode: 'espn_live_first',
      pollIntervalSeconds: Math.max(config.pollIntervalSeconds, config.minPollIntervalSeconds),
      maxDurationMinutes: config.maxSessionMinutes,
      snapshotsCaptured: 0,
      governanceEvaluations: 0,
      liveRechecks: 0,
      errors: [],
      warnings: [...discovery.limitations],
      limitations: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    // Initialize fixture states
    const fixtureStates = new Map<string, LiveMonitoringFixtureState>()
    for (const selected of discovery.selected) {
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
      fixtureStates.set(selected.fixtureId, state)
    }

    // Save session to repository
    await repos.intelligence.saveLiveMonitoringSession(session)
    for (const state of fixtureStates.values()) {
      await repos.intelligence.saveLiveMonitoringFixtureState(state)
    }

    // Start polling loop
    const pollInterval = session.pollIntervalSeconds * 1000
    const maxDuration = session.maxDurationMinutes * 60 * 1000
    const sessionStart = Date.now()

    const intervalHandle = setInterval(async () => {
      const elapsed = Date.now() - sessionStart
      if (elapsed > maxDuration) {
        await stopMonitoringSession(sessionId, 'Max duration reached')
        return
      }

      await monitorSessionFixtures(sessionId)
    }, pollInterval)

    // Store active session
    activeSessions.set(sessionId, {
      session,
      fixtureStates,
      intervalHandle
    })

    // Run initial monitoring cycle
    await monitorSessionFixtures(sessionId)

    return {
      success: true,
      sessionId,
      message: `Started monitoring ${discovery.selected.length} fixtures`,
      session
    }

  } catch (error: any) {
    return {
      success: false,
      message: `Failed to start session: ${error?.message || 'unknown'}`
    }
  }
}

/**
 * Monitor all fixtures in a session
 */
async function monitorSessionFixtures(sessionId: string): Promise<void> {
  const activeSession = activeSessions.get(sessionId)
  if (!activeSession) return

  const { session, fixtureStates } = activeSession
  const repos = createRepositories()

  try {
    // Check provider budget first
    const budget = guardProviderCall('espn', 'live_fixtures')
    if (budget.blockedByProviderBudget) {
      session.warnings.push(`Polling skipped: ${budget.reason}`)
      return
    }

    // Fetch current fixtures
    const espnResult = await fetchEspnLiveFixtures()
    if (!espnResult.success) {
      session.errors.push(`ESPN fetch failed: ${espnResult.error || 'unknown'}`)
      return
    }

    // Monitor each fixture
    for (const fixtureId of session.fixtureIds) {
      const state = fixtureStates.get(fixtureId)
      if (!state || state.completed) continue

      await monitorFixtureLive(fixtureId, espnResult.fixtures, session, state)
    }

    // Update session
    session.updatedAt = new Date().toISOString()
    await repos.intelligence.updateLiveMonitoringSession(sessionId, {
      snapshotsCaptured: session.snapshotsCaptured,
      governanceEvaluations: session.governanceEvaluations,
      liveRechecks: session.liveRechecks,
      errors: session.errors,
      warnings: session.warnings,
      updatedAt: session.updatedAt
    })

  } catch (error: any) {
    session.errors.push(`Monitoring error: ${error?.message || 'unknown'}`)

    // Stop session on too many errors
    if (session.errors.length >= 5) {
      await stopMonitoringSession(sessionId, 'Too many errors')
    }
  }
}

/**
 * Monitor a single fixture live
 */
async function monitorFixtureLive(
  fixtureId: string,
  allFixtures: any[],
  session: LiveMonitoringSession,
  state: LiveMonitoringFixtureState
): Promise<void> {
  const repos = createRepositories()
  const config = getConfig()

  try {
    // Find current fixture data
    const current = allFixtures.find(f => f.providerFixtureId === fixtureId)
    if (!current) {
      state.limitations.push('Fixture no longer in ESPN feed')
      return
    }

    // Check if fixture completed
    if (config.stopOnFullTime && (current.status === 'FT' || current.status === 'AET' || current.status === 'PEN')) {
      state.completed = true
      state.limitations.push(`Match completed: ${current.status}`)
      await repos.intelligence.updateLiveMonitoringFixtureState(state.id, {
        completed: true,
        limitations: state.limitations,
        updatedAt: new Date().toISOString()
      })
      return
    }

    // Upsert fixture and get ID
    const dbFixtureId = await upsertFixture(current)

    // Get previous snapshot for diff
    const previousSnapshot = await repos.liveSnapshots.findLatestByFixture(dbFixtureId)

    // Capture snapshot with optional enrichment
    let enrichedStats = null
    let enrichedEvents = null

    if (config.enableEnrichment && session.fixtureIds.indexOf(fixtureId) < config.maxEnrichmentFixtures) {
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
      session.snapshotsCaptured++
      state.snapshotCount++
      state.firstSnapshotAt = state.firstSnapshotAt || new Date().toISOString()
      state.lastSnapshotAt = new Date().toISOString()
      state.lastStatus = current.status
      state.lastMinute = current.minute
      state.lastScore = { home: current.scoreHome, away: current.scoreAway }

      // Get new snapshot for diff
      const newSnapshot = await repos.liveSnapshots.findLatestByFixture(dbFixtureId)

      if (newSnapshot && previousSnapshot) {
        // Detect changes
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

        // Count detected events
        state.eventsDetected += diff.detectedChanges.length

        // Trigger governance recheck if needed
        if (diff.shouldTriggerGovernanceRecheck && isLiveRecheckBridgeEnabled()) {
          try {
            const recheckResult = await onLiveSnapshotCaptured(newSnapshot, previousSnapshot)
            if (recheckResult.enqueued.length > 0) {
              await processRecheckQueue()
              state.rechecksTriggered += recheckResult.enqueued.length
              session.liveRechecks += recheckResult.enqueued.length
            }
          } catch (recheckError: any) {
            session.warnings.push(`Recheck failed for ${fixtureId}: ${recheckError?.message}`)
          }
        }

        session.governanceEvaluations++
      }

      // Update state
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

  } catch (error: any) {
    session.errors.push(`Monitor ${fixtureId}: ${error?.message || 'unknown'}`)
  }
}

/**
 * Stop a monitoring session
 */
export async function stopMonitoringSession(sessionId: string, reason?: string): Promise<{
  success: boolean
  message: string
}> {
  const activeSession = activeSessions.get(sessionId)
  if (!activeSession) {
    return { success: false, message: 'Session not found or already stopped' }
  }

  const { session, intervalHandle } = activeSession
  const repos = createRepositories()

  try {
    // Clear interval
    if (intervalHandle) {
      clearInterval(intervalHandle)
    }

    // Update session status
    const status: LiveMonitoringSessionStatus = session.errors.length > 0
      ? 'completed_with_warnings'
      : 'completed'

    await repos.intelligence.updateLiveMonitoringSession(sessionId, {
      status,
      endedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })

    // Remove from active sessions
    activeSessions.delete(sessionId)

    return {
      success: true,
      message: `Session stopped: ${reason || 'manual stop'}`
    }

  } catch (error: any) {
    return {
      success: false,
      message: `Failed to stop session: ${error?.message || 'unknown'}`
    }
  }
}

/**
 * Get monitoring session summary
 */
export async function buildLiveMonitoringSummary(sessionId: string): Promise<LiveMonitoringResult | null> {
  const repos = createRepositories()

  try {
    const session = await repos.intelligence.getLiveMonitoringSession(sessionId)
    if (!session) return null

    const fixtureStates = await repos.intelligence.listLiveMonitoringFixtureStates(sessionId)

    const startTime = new Date(session.startedAt)
    const endTime = session.endedAt ? new Date(session.endedAt) : new Date()
    const duration = Math.round((endTime.getTime() - startTime.getTime()) / 1000 / 60) // minutes

    const completed = fixtureStates.filter((s: any) => s.completed).length
    const totalSnapshots = fixtureStates.reduce((sum: number, s: any) => sum + s.snapshotCount, 0)

    return {
      sessionId,
      status: session.status,
      duration: `${duration}m`,
      fixtures: {
        discovered: session.fixtureIds.length,
        selected: session.fixtureIds.length,
        monitored: fixtureStates.length,
        completed
      },
      snapshots: {
        captured: totalSnapshots,
        rich: 0, // Would need to analyze snapshot quality
        partial: totalSnapshots,
        poor: 0
      },
      events: {
        detected: fixtureStates.reduce((sum: number, s: any) => sum + s.eventsDetected, 0),
        rechecksTriggered: fixtureStates.reduce((sum: number, s: any) => sum + s.rechecksTriggered, 0),
        governanceEvaluations: session.governanceEvaluations
      },
      errors: session.errors,
      warnings: session.warnings,
      limitations: session.limitations
    }

  } catch (error: any) {
    return null
  }
}

/**
 * List active sessions
 */
export function listActiveSessions(): string[] {
  return Array.from(activeSessions.keys())
}

/**
 * Get active session details
 */
export function getActiveSessionDetails(sessionId: string) {
  const activeSession = activeSessions.get(sessionId)
  if (!activeSession) return null

  const { session, fixtureStates } = activeSession
  return {
    session,
    fixtures: Array.from(fixtureStates.values()),
    isRunning: !!activeSessions.has(sessionId)
  }
}