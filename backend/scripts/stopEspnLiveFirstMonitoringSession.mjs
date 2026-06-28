#!/usr/bin/env node
/**
 * Stop ESPN Live-First Monitoring Session — B57 Operational Script
 * ─────────────────────────────────────────────────────────────────────────────
 * Stops an active live monitoring session.
 * Usage: node backend/scripts/stopEspnLiveFirstMonitoringSession.mjs [sessionId]
 */
import { stopMonitoringSession, buildLiveMonitoringSummary, listActiveSessions, getActiveSessionDetails } from '../src/modules/footballIntelligence/live/espnLiveFirstMonitoringRunner.service.js'

async function main() {
  const args = process.argv.slice(2)
  let sessionId = args[0]

  try {
    // If no session ID provided, list active sessions
    if (!sessionId) {
      const activeSessions = listActiveSessions()
      if (activeSessions.length === 0) {
        console.log('ℹ️  No active monitoring sessions found.')
        process.exit(0)
      }

      if (activeSessions.length === 1) {
        sessionId = activeSessions[0]
        console.log(`🎯 Found single active session: ${sessionId}`)
      } else {
        console.log('🔍 Multiple active sessions found:')
        activeSessions.forEach((id, index) => {
          console.log(`${index + 1}. ${id}`)
        })
        console.log('Please specify which session to stop:')
        console.log('node backend/scripts/stopEspnLiveFirstMonitoringSession.mjs <sessionId>')
        process.exit(1)
      }
    }

    // Get session details before stopping
    const sessionDetails = getActiveSessionDetails(sessionId)
    if (sessionDetails) {
      console.log('\n📊 Session Status Before Stop:')
      console.log(`Session: ${sessionId}`)
      console.log(`Status: ${sessionDetails.session.status}`)
      console.log(`Started: ${sessionDetails.session.startedAt}`)
      console.log(`Fixtures: ${sessionDetails.fixtures.length}`)
      console.log(`Snapshots: ${sessionDetails.session.snapshotsCaptured}`)
      console.log(`Rechecks: ${sessionDetails.session.liveRechecks}`)

      if (sessionDetails.session.errors.length > 0) {
        console.log(`Errors: ${sessionDetails.session.errors.length}`)
      }
    }

    console.log(`\n🛑 Stopping monitoring session: ${sessionId}`)

    const result = await stopMonitoringSession(sessionId, 'Manual stop via script')

    if (!result.success) {
      console.error('❌ Failed to stop session:', result.message)
      process.exit(1)
    }

    console.log('✅ Session stopped successfully!')
    console.log(`Message: ${result.message}`)

    // Get final summary
    const summary = await buildLiveMonitoringSummary(sessionId)
    if (summary) {
      console.log('\n📈 Final Session Summary:')
      console.log(`Status: ${summary.status}`)
      console.log(`Duration: ${summary.duration}`)
      console.log(`Fixtures monitored: ${summary.fixtures.monitored}`)
      console.log(`Fixtures completed: ${summary.fixtures.completed}`)
      console.log(`Total snapshots: ${summary.snapshots.captured}`)
      console.log(`Events detected: ${summary.events.detected}`)
      console.log(`Governance evaluations: ${summary.events.governanceEvaluations}`)
      console.log(`Rechecks triggered: ${summary.events.rechecksTriggered}`)

      if (summary.errors.length > 0) {
        console.log('\n❌ Errors encountered:')
        summary.errors.forEach(error => console.log(`  • ${error}`))
      }

      if (summary.warnings.length > 0) {
        console.log('\n⚠️  Warnings:')
        summary.warnings.forEach(warning => console.log(`  • ${warning}`))
      }

      if (summary.limitations.length > 0) {
        console.log('\n📝 Limitations:')
        summary.limitations.forEach(limitation => console.log(`  • ${limitation}`))
      }
    }

    process.exit(0)

  } catch (error) {
    console.error('❌ Failed to stop monitoring session:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

main()