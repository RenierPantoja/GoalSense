#!/usr/bin/env node
/**
 * Start ESPN Live-First Monitoring Session — B57 Operational Script
 * ─────────────────────────────────────────────────────────────────────────────
 * Starts a real live monitoring session with ESPN data.
 * Usage: node backend/scripts/startEspnLiveFirstMonitoringSession.mjs [--duration=120]
 */
import { startEspnLiveFirstMonitoringSession, buildLiveMonitoringSummary, listActiveSessions } from '../src/modules/footballIntelligence/live/espnLiveFirstMonitoringRunner.service.js'

async function main() {
  const args = process.argv.slice(2)
  const durationArg = args.find(arg => arg.startsWith('--duration='))
  const customDuration = durationArg ? parseInt(durationArg.split('=')[1]) : null

  try {
    // Check for active sessions first
    const activeSessions = listActiveSessions()
    if (activeSessions.length > 0) {
      console.log('⚠️  Active sessions found:')
      activeSessions.forEach(sessionId => console.log(`  • ${sessionId}`))
      console.log('Use stopEspnLiveFirstMonitoringSession.mjs to stop them first')
      process.exit(1)
    }

    console.log('🚀 Starting ESPN Live-First monitoring session...')
    if (customDuration) {
      process.env.ESPN_LIVE_FIRST_MAX_SESSION_MINUTES = customDuration.toString()
      console.log(`Custom duration set: ${customDuration} minutes`)
    }

    const result = await startEspnLiveFirstMonitoringSession()

    if (!result.success) {
      console.error('❌ Failed to start session:', result.message)
      process.exit(1)
    }

    console.log('✅ Session started successfully!')
    console.log(`Session ID: ${result.sessionId}`)
    console.log(`Message: ${result.message}`)

    if (result.session) {
      console.log('\n📊 Session Details:')
      console.log(`Mode: ${result.session.mode}`)
      console.log(`Poll interval: ${result.session.pollIntervalSeconds}s`)
      console.log(`Max duration: ${result.session.maxDurationMinutes}m`)
      console.log(`Fixtures: ${result.session.fixtureIds.length}`)

      if (result.session.warnings.length > 0) {
        console.log('\n⚠️  Warnings:')
        result.session.warnings.forEach(warning => console.log(`  • ${warning}`))
      }
    }

    console.log('\n🎯 Monitoring started. Use these commands:')
    console.log(`  • Check status: node backend/scripts/checkEspnLiveFirstSession.mjs ${result.sessionId}`)
    console.log(`  • Stop session: node backend/scripts/stopEspnLiveFirstMonitoringSession.mjs ${result.sessionId}`)

    // Monitor for first few cycles
    console.log('\n👀 Monitoring first 3 cycles...')
    for (let i = 0; i < 3; i++) {
      await new Promise(resolve => setTimeout(resolve, 30000)) // 30s between checks

      const summary = await buildLiveMonitoringSummary(result.sessionId)
      if (summary) {
        console.log(`\n📈 Cycle ${i + 1} Summary:`)
        console.log(`Status: ${summary.status}`)
        console.log(`Duration: ${summary.duration}`)
        console.log(`Snapshots: ${summary.snapshots.captured}`)
        console.log(`Events: ${summary.events.detected}`)
        console.log(`Rechecks: ${summary.events.rechecksTriggered}`)

        if (summary.errors.length > 0) {
          console.log('Errors:', summary.errors.slice(0, 2).join(', '))
        }
      }
    }

    console.log('\n🎉 Initial monitoring complete. Session continues in background.')
    console.log('Monitor logs or use status scripts to check progress.')

    process.exit(0)

  } catch (error) {
    console.error('❌ Failed to start monitoring session:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

main()