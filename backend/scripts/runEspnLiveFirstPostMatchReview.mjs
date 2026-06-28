#!/usr/bin/env node
/**
 * Run ESPN Live-First Post-Match Review — B57 Operational Script
 * ─────────────────────────────────────────────────────────────────────────────
 * Reviews completed live monitoring sessions and creates causal cases.
 * Usage: node backend/scripts/runEspnLiveFirstPostMatchReview.mjs [sessionId]
 */
import { createRepositories } from '../src/repositories/index.js'
import { buildLiveMonitoringSummary } from '../src/modules/footballIntelligence/live/espnLiveFirstMonitoringRunner.service.js'

async function reviewSession(sessionId) {
  const repos = createRepositories()

  try {
    console.log(`\n🔍 Reviewing session: ${sessionId}`)

    const session = await repos.intelligence.getLiveMonitoringSession(sessionId)
    if (!session) {
      console.log(`❌ Session ${sessionId} not found`)
      return false
    }

    const summary = await buildLiveMonitoringSummary(sessionId)
    if (!summary) {
      console.log(`❌ Could not build summary for ${sessionId}`)
      return false
    }

    console.log(`📊 Session Summary:`)
    console.log(`  Status: ${summary.status}`)
    console.log(`  Duration: ${summary.duration}`)
    console.log(`  Fixtures: ${summary.fixtures.monitored} monitored, ${summary.fixtures.completed} completed`)
    console.log(`  Data: ${summary.snapshots.captured} snapshots, ${summary.events.detected} events`)
    console.log(`  Governance: ${summary.events.governanceEvaluations} evaluations, ${summary.events.rechecksTriggered} rechecks`)

    // Get fixture states for detailed analysis
    const fixtureStates = await repos.intelligence.listLiveMonitoringFixtureStates(sessionId)

    console.log(`\n📝 Fixture Analysis:`)
    let causalCasesEligible = 0
    let insufficientData = 0
    let ongoingMatches = 0

    for (const state of fixtureStates) {
      const fixture = await repos.fixtures.findById(state.fixtureId)
      const fixtureName = fixture ? `${fixture.homeName} vs ${fixture.awayName}` : `Fixture ${state.fixtureId}`

      console.log(`\n  🏈 ${fixtureName}:`)
      console.log(`    Snapshots: ${state.snapshotCount}`)
      console.log(`    Last status: ${state.lastStatus || 'unknown'}`)
      console.log(`    Last score: ${state.lastScore ? `${state.lastScore.home}-${state.lastScore.away}` : 'unknown'}`)
      console.log(`    Events: ${state.eventsDetected}`)
      console.log(`    Rechecks: ${state.rechecksTriggered}`)
      console.log(`    Completed: ${state.completed}`)

      // Determine causal case eligibility
      if (state.completed && state.lastStatus && ['FT', 'AET', 'PEN'].includes(state.lastStatus)) {
        if (state.snapshotCount >= 3 && state.eventsDetected >= 1) {
          console.log(`    ✅ Eligible for causal case: sufficient data`)
          causalCasesEligible++
        } else {
          console.log(`    ⚠️  Limited data: ${state.snapshotCount} snapshots, ${state.eventsDetected} events`)
          insufficientData++
        }
      } else if (!state.completed) {
        console.log(`    ⏳ Still ongoing`)
        ongoingMatches++
      } else {
        console.log(`    ❌ Insufficient outcome data`)
        insufficientData++
      }

      if (state.limitations.length > 0) {
        console.log(`    Issues: ${state.limitations.join(', ')}`)
      }
    }

    console.log(`\n📊 Post-Match Summary:`)
    console.log(`  Causal cases eligible: ${causalCasesEligible}`)
    console.log(`  Insufficient data: ${insufficientData}`)
    console.log(`  Still ongoing: ${ongoingMatches}`)

    if (summary.errors.length > 0) {
      console.log(`\n❌ Session Errors:`)
      summary.errors.forEach(error => console.log(`  • ${error}`))
    }

    // TODO B57: Create actual causal learning cases here
    // This would integrate with the causal learning system
    console.log(`\n💡 Next Steps:`)
    if (causalCasesEligible > 0) {
      console.log(`  • Create ${causalCasesEligible} causal learning cases`)
      console.log(`  • Analyze governance decision accuracy`)
      console.log(`  • Update live-first learning profiles`)
    }
    if (ongoingMatches > 0) {
      console.log(`  • Monitor ${ongoingMatches} ongoing matches`)
      console.log(`  • Re-run review after completion`)
    }

    return true

  } catch (error) {
    console.error(`❌ Failed to review session ${sessionId}:`, error.message)
    return false
  }
}

async function main() {
  const args = process.argv.slice(2)
  const sessionId = args[0]

  try {
    const repos = createRepositories()

    if (sessionId) {
      // Review specific session
      await reviewSession(sessionId)
    } else {
      // Review all recent sessions
      console.log('🔍 Finding recent live monitoring sessions...')

      const sessions = await repos.intelligence.listLiveMonitoringSessions(10)
      if (sessions.length === 0) {
        console.log('ℹ️  No live monitoring sessions found.')
        process.exit(0)
      }

      console.log(`📋 Found ${sessions.length} recent sessions:`)
      sessions.forEach((session, index) => {
        const duration = session.endedAt
          ? Math.round((new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 60000)
          : '?'
        console.log(`${index + 1}. ${session.id} (${session.status}, ${duration}m, ${session.fixtureIds.length} fixtures)`)
      })

      console.log(`\n🔍 Reviewing all sessions...`)
      let reviewed = 0
      for (const session of sessions) {
        const success = await reviewSession(session.id)
        if (success) reviewed++
      }

      console.log(`\n✅ Reviewed ${reviewed}/${sessions.length} sessions successfully.`)
    }

    process.exit(0)

  } catch (error) {
    console.error('❌ Post-match review failed:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

main()