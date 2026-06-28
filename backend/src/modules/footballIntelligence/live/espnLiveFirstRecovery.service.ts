/**
 * ESPN Live-First Recovery Service — B59 Orphan Session Recovery
 * ─────────────────────────────────────────────────────────────────────────────
 * Detects and recovers orphaned ESPN Live-First monitoring sessions after worker
 * crashes or restarts. Ensures sessions don't become stuck in running state.
 */
import { createRepositories } from '../../../repositories/index.js'
import type { EspnLiveFirstRecoveryReport, OrphanDetectionResult } from './espnLiveFirstWorker.types.js'

/**
 * Detect orphaned sessions (running sessions without active workers)
 */
export async function detectOrphanedSessions(): Promise<OrphanDetectionResult> {
  const repos = createRepositories()

  try {
    const orphanedSessions: OrphanDetectionResult['sessions'] = []
    let orphanedFixtureIds: string[] = []

    // Get all sessions
    const sessions = await repos.intelligence.listLiveMonitoringSessions(100)

    for (const session of sessions) {
      if (session.status === 'running') {
        // Check if there's an active worker for this session
        // In this implementation, we check for worker runs with matching session ID
        // For now, we'll assume if no recent heartbeat, it's orphaned

        // Check if session has active leases
        const leases = await repos.intelligence.listEspnLiveFirstFixtureLeases(100)
        const activeLeases = leases.filter(
          l => l.sessionId === session.id && l.status === 'active'
        )

        // If no active leases or leases expired, session is orphaned
        const isOrphaned = activeLeases.length === 0 || activeLeases.some(
          l => Date.now() >= new Date(l.leaseExpiresAt).getTime()
        )

        if (isOrphaned) {
          const lastHeartbeat = session.endedAt || session.updatedAt || session.startedAt
          orphanedSessions.push({
            sessionId: session.id,
            sessionStatus: session.status,
            lastHeartbeat: lastHeartbeat || 'unknown',
            fixtures: session.fixtureIds,
            leaseStatus: activeLeases.length > 0 ? 'active' : 'none',
            recoverable: activeLeases.length > 0,
            reason: 'No active worker run found or leases expired'
          })
          orphanedFixtureIds.push(...session.fixtureIds)
        }
      }
    }

    return {
      sessions: orphanedSessions,
      orphanedFixtures: orphanedFixtureIds,
      totalOrphanedSessions: orphanedSessions.length,
      totalOrphanedFixtures: orphanedFixtureIds.length,
      canRecover: orphanedSessions.length > 0
    }

  } catch (error: any) {
    return {
      sessions: [],
      orphanedFixtures: [],
      totalOrphanedSessions: 0,
      totalOrphanedFixtures: 0,
      canRecover: false
    }
  }
}

/**
 * Recover an orphaned session
 */
export async function recoverOrphanedSession(sessionId: string): Promise<{
  success: boolean
  session?: any
  reasons: string[]
  limitations: string[]
}> {
  const repos = createRepositories()

  try {
    const session = await repos.intelligence.getLiveMonitoringSession(sessionId)
    if (!session) {
      return {
        success: false,
        reasons: [`Session ${sessionId} not found`],
        limitations: []
      }
    }

    if (session.status !== 'running') {
      return {
        success: false,
        reasons: [`Session ${sessionId} status is ${session.status}, not running`],
        limitations: []
      }
    }

    // For now, we'll mark this as recovered
    // In a full implementation, we'd reacquire leases and resume monitoring
    await repos.intelligence.updateLiveMonitoringSession(sessionId, {
      status: 'completed_with_warnings',
      warnings: [...(session.warnings || []), 'Recovering orphaned session'],
      limitations: [...(session.limitations || []), 'Recovered from orphaned state'],
      endedAt: new Date().toISOString()
    })

    return {
      success: true,
      session,
      reasons: ['Orphaned session recovered - marked as completed_with_warnings'],
      limitations: ['Full reconnection not yet implemented']
    }

  } catch (error: any) {
    return {
      success: false,
      reasons: [`Failed to recover session: ${error?.message || 'unknown'}`],
      limitations: []
    }
  }
}

/**
 * Close expired sessions
 */
export async function closeExpiredSession(sessionId: string): Promise<{
  success: boolean
  message: string
}> {
  const repos = createRepositories()

  try {
    const session = await repos.intelligence.getLiveMonitoringSession(sessionId)
    if (!session) {
      return { success: false, message: 'Session not found' }
    }

    await repos.intelligence.updateLiveMonitoringSession(sessionId, {
      status: 'completed_with_warnings',
      endedAt: new Date().toISOString(),
      warnings: [...(session.warnings || []), 'Session closed due to expiration without marking as failed'],
      limitations: [...(session.limitations || []), 'Orphaned session could not be safely resumed; no full-time/outcome was invented']
    })

    return { success: true, message: `Session ${sessionId} closed due to expiration` }

  } catch (error: any) {
    return { success: false, message: `Failed to close session: ${error?.message || 'unknown'}` }
  }
}

/**
 * Run recovery sweep
 */
export async function runRecoverySweep(): Promise<{
  report: EspnLiveFirstRecoveryReport
  sessionsRecovered: number
  sessionsClosed: number
  sessionsSkipped: number
}> {
  const repos = createRepositories()

  try {
    const orphaned = await detectOrphanedSessions()

    let recovered = 0
    let closed = 0
    let skipped = 0
    const reasons: string[] = []
    const recoveredSessionIds: string[] = []
    const closedSessionIds: string[] = []
    const skippedSessionIds: string[] = []

    if (!orphaned.canRecover) {
      reasons.push('No orphaned sessions detected')
    }

    for (const sessionInfo of orphaned.sessions) {
      // Try to recover
      const recovery = await recoverOrphanedSession(sessionInfo.sessionId)

      if (recovery.success) {
        recovered++
        recoveredSessionIds.push(sessionInfo.sessionId)
        reasons.push(`Recovered: ${sessionInfo.sessionId}`)
      } else if (sessionInfo.sessionStatus === 'running' && !sessionInfo.recoverable) {
        // Try to close
        const closeResult = await closeExpiredSession(sessionInfo.sessionId)
        if (closeResult.success) {
          closed++
          closedSessionIds.push(sessionInfo.sessionId)
          reasons.push(`Closed expired: ${sessionInfo.sessionId}`)
        } else {
          skipped++
          skippedSessionIds.push(sessionInfo.sessionId)
          reasons.push(`Skipped: ${sessionInfo.sessionId} (${closeResult.message})`)
        }
      } else {
        skipped++
        skippedSessionIds.push(sessionInfo.sessionId)
        reasons.push(`Skipped: ${sessionInfo.sessionId} (${recovery.reasons.join(', ')})`)
      }
    }

    const report: EspnLiveFirstRecoveryReport = {
      id: `recovery_${Date.now()}`,
      generatedAt: new Date().toISOString(),
      orphanedSessionsFound: orphaned.totalOrphanedSessions,
      orphanedFixturesFound: orphaned.totalOrphanedFixtures,
      recoveredSessions: recoveredSessionIds,
      closedSessions: closedSessionIds,
      skippedSessions: skippedSessionIds,
      reasons,
      limitations: orphaned.sessions.length > 0 ? ['Full recovery requires worker restart'] : []
    }

    await repos.intelligence.saveEspnLiveFirstRecoveryReport(report)

    return {
      report,
      sessionsRecovered: recovered,
      sessionsClosed: closed,
      sessionsSkipped: skipped
    }

  } catch (error: any) {
    const report: EspnLiveFirstRecoveryReport = {
      id: `recovery_${Date.now()}`,
      generatedAt: new Date().toISOString(),
      orphanedSessionsFound: 0,
      orphanedFixturesFound: 0,
      recoveredSessions: [],
      closedSessions: [],
      skippedSessions: [],
      reasons: [`Recovery sweep failed: ${error?.message || 'unknown'}`],
      limitations: ['Recovery sweep failed']
    }

    return {
      report,
      sessionsRecovered: 0,
      sessionsClosed: 0,
      sessionsSkipped: 0
    }
  }
}
