#!/usr/bin/env node
/**
 * Run Today ESPN Live-First Validation — B57 Operational Script
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs a complete ESPN Live-First validation session for today's matches.
 * Usage: node backend/scripts/runTodayEspnLiveFirstValidation.mjs
 */
import { runEspnLiveFirstValidationNow, completeEspnLiveFirstValidation } from '../src/modules/footballIntelligence/validation/espnLiveFirstValidationRunner.service.js'
import { generateDailyValidationReport } from '../src/modules/footballIntelligence/validation/dailyValidationReport.service.js'

async function main() {
  const today = new Date().toISOString().slice(0, 10)

  try {
    console.log(`🎯 Running ESPN Live-First validation for ${today}`)
    console.log('=' .repeat(60))

    // Start validation
    console.log('\n🚀 Starting validation session...')
    const startResult = await runEspnLiveFirstValidationNow()

    if (!startResult.success) {
      console.log(`❌ Failed to start validation: ${startResult.message}`)

      if (startResult.validationSessionId) {
        console.log(`📋 Validation session created: ${startResult.validationSessionId}`)
      }

      if (startResult.message.includes('No live fixtures')) {
        console.log('\n💡 This is normal outside of match times.')
        console.log('Try running during evening hours when matches are typically played.')
        process.exit(0)
      }

      process.exit(1)
    }

    console.log(`✅ Validation started successfully!`)
    console.log(`📋 Validation session: ${startResult.validationSessionId}`)
    console.log(`🎮 Live monitoring: ${startResult.liveMonitoringSessionId}`)
    console.log(`📝 ${startResult.message}`)

    if (startResult.summary) {
      console.log('\n📊 Initial Status:')
      console.log(`Fixtures: ${startResult.summary.fixtures.monitored} monitored`)
      console.log(`Snapshots: ${startResult.summary.snapshots.captured} captured`)
      console.log(`Events: ${startResult.summary.events.detected} detected`)
    }

    // Monitor progress
    console.log('\n⏳ Monitoring in progress...')
    console.log('The live monitoring session will continue automatically.')
    console.log('You can check progress with:')
    console.log(`  node backend/scripts/checkEspnLiveFirstSession.mjs ${startResult.liveMonitoringSessionId}`)

    // Ask user if they want to wait for completion or exit
    console.log('\n❓ Options:')
    console.log('1. Let monitoring continue in background (press Ctrl+C)')
    console.log('2. Wait for session completion (this may take 1-3 hours)')

    const waitForCompletion = process.argv.includes('--wait')

    if (!waitForCompletion) {
      console.log('\n👍 Monitoring continues in background.')
      console.log('Use these commands to manage the session:')
      console.log(`  • Check status: node backend/scripts/checkEspnLiveFirstSession.mjs ${startResult.liveMonitoringSessionId}`)
      console.log(`  • Stop early: node backend/scripts/stopEspnLiveFirstMonitoringSession.mjs ${startResult.liveMonitoringSessionId}`)
      console.log(`  • Complete validation: node backend/scripts/completeEspnLiveFirstValidation.mjs ${startResult.validationSessionId} ${startResult.liveMonitoringSessionId}`)

      process.exit(0)
    }

    // Wait for completion (if --wait flag used)
    console.log('\n⏳ Waiting for session completion...')

    // Poll for completion (check every 2 minutes)
    const pollInterval = 2 * 60 * 1000 // 2 minutes
    const maxWait = 4 * 60 * 60 * 1000 // 4 hours max
    const startTime = Date.now()

    while (Date.now() - startTime < maxWait) {
      await new Promise(resolve => setTimeout(resolve, pollInterval))

      // TODO: Check if monitoring session completed
      // For now, we'll just show periodic updates
      const elapsed = Math.round((Date.now() - startTime) / 60000)
      console.log(`⏱️  Monitoring for ${elapsed} minutes...`)
    }

    console.log('\n⏰ Maximum wait time reached. Completing validation...')

    // Complete validation
    const completeResult = await completeEspnLiveFirstValidation(
      startResult.validationSessionId!,
      startResult.liveMonitoringSessionId!
    )

    if (completeResult.success) {
      console.log('✅ Validation completed!')

      if (completeResult.report) {
        console.log('\n📊 Final Report:')
        console.log(`Duration: ${completeResult.report.duration}`)
        console.log(`Fixtures: ${completeResult.report.fixtures.monitored || 0} monitored, ${completeResult.report.fixtures.completed || 0} completed`)
        console.log(`Snapshots: ${completeResult.report.snapshots.captured || 0} captured`)
        console.log(`Events: ${completeResult.report.events.detected || 0} detected`)
        console.log(`Quality: ${completeResult.report.quality}`)

        if (completeResult.report.limitations.length > 0) {
          console.log('\n📝 Limitations:')
          completeResult.report.limitations.forEach((limitation: string) => {
            console.log(`  • ${limitation}`)
          })
        }

        if (completeResult.report.recommendations.length > 0) {
          console.log('\n💡 Recommendations:')
          completeResult.report.recommendations.forEach((rec: string) => {
            console.log(`  • ${rec}`)
          })
        }
      }
    } else {
      console.log(`❌ Failed to complete validation: ${completeResult.message}`)
    }

    // Generate daily report
    console.log('\n📈 Generating daily validation report...')
    const dailyReport = await generateDailyValidationReport(today)

    console.log(`Daily report generated for ${today}`)
    console.log(`Live-first sessions: ${dailyReport.liveFirstReal ? 'Real data used' : 'No real sessions'}`)
    console.log(`ESPN snapshots: ${dailyReport.espnLiveSnapshotsCaptured}`)
    console.log(`Live evaluations: ${dailyReport.liveGovernanceEvaluations}`)

    process.exit(0)

  } catch (error) {
    console.error('❌ Validation failed:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

main()