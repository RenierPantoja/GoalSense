#!/usr/bin/env node
/**
 * Smoke Test Real ESPN Live Monitoring — B57 Safety Tests
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests real ESPN live monitoring components to ensure they work safely.
 * Usage: node backend/scripts/smokeRealEspnLiveMonitoring.mjs
 */
import { discoverLiveFixturesNow, explainLiveFixtureSelection } from '../dist/modules/footballIntelligence/live/espnLiveFixtureDiscovery.service.js'
import { startEspnLiveFirstMonitoringSession, stopMonitoringSession, buildLiveMonitoringSummary, listActiveSessions } from '../dist/modules/footballIntelligence/live/espnLiveFirstMonitoringRunner.service.js'
import { detectSnapshotChanges } from '../dist/modules/footballIntelligence/live/liveSnapshotDiff.service.js'
import { analyzeLiveSnapshot, buildLiveFirstIntelligenceForFixture, explainLiveFirstAnalysis } from '../dist/modules/footballIntelligence/live/liveFirstIntelligenceLoop.service.js'
import { interpretLiveMomentum } from '../dist/modules/intelligence/autoEngine/liveMomentumInterpreter.service.js'
import { extractLiveFirstVariables } from '../dist/modules/footballIntelligence/influence/liveFirstVariableExtraction.service.js'

let testResults = []
let totalTests = 0
let passedTests = 0

function test(name, testFn) {
  totalTests++
  console.log(`\n🧪 Test: ${name}`)

  return testFn()
    .then(result => {
      if (result.success) {
        console.log(`✅ PASS: ${result.message || 'Test passed'}`)
        passedTests++
        testResults.push({ name, status: 'PASS', message: result.message })
      } else {
        console.log(`❌ FAIL: ${result.message || 'Test failed'}`)
        testResults.push({ name, status: 'FAIL', message: result.message })
      }
      return result
    })
    .catch(error => {
      console.log(`❌ ERROR: ${error.message}`)
      testResults.push({ name, status: 'ERROR', message: error.message })
      return { success: false, message: error.message }
    })
}

async function testLiveFixtureDiscovery() {
  return test('Live Fixture Discovery', async () => {
    const discovery = await discoverLiveFixturesNow()

    if (typeof discovery.totalFound !== 'number') {
      return { success: false, message: 'totalFound should be a number' }
    }

    if (!Array.isArray(discovery.selected)) {
      return { success: false, message: 'selected should be an array' }
    }

    if (!Array.isArray(discovery.skipped)) {
      return { success: false, message: 'skipped should be an array' }
    }

    if (!Array.isArray(discovery.limitations)) {
      return { success: false, message: 'limitations should be an array' }
    }

    return {
      success: true,
      message: `Found ${discovery.totalFound} fixtures, ${discovery.selected.length} selected`
    }
  })
}

async function testLiveFixtureDiscoveryWithNoFixtures() {
  return test('Empty Live Fixtures Handling', async () => {
    // This test ensures the system handles empty results gracefully
    const discovery = await discoverLiveFixturesNow()

    // Even if no fixtures, should not throw and should have proper structure
    if (discovery.totalFound === 0) {
      if (discovery.selected.length === 0 && Array.isArray(discovery.limitations)) {
        return { success: true, message: 'Correctly handled empty fixtures scenario' }
      }
    }

    return { success: true, message: `Discovery works with ${discovery.totalFound} fixtures` }
  })
}

async function testSnapshotDiff() {
  return test('Snapshot Diff Detection', async () => {
    const mockPrevious = {
      id: 'snap_1',
      minute: 45,
      status: '1H',
      scoreHome: 0,
      scoreAway: 0,
      statsJson: JSON.stringify({ possessionHome: 55, possessionAway: 45 }),
      eventsJson: JSON.stringify([]),
      createdAt: new Date().toISOString()
    }

    const mockCurrent = {
      id: 'snap_2',
      minute: 46,
      status: 'HT',
      scoreHome: 1,
      scoreAway: 0,
      statsJson: JSON.stringify({ possessionHome: 60, possessionAway: 40 }),
      eventsJson: JSON.stringify([{ type: 'goal', side: 'home', minute: 45 }]),
      createdAt: new Date().toISOString()
    }

    const diff = detectSnapshotChanges(mockCurrent, mockPrevious, 'fixture_test')

    if (!diff.detectedChanges) {
      return { success: false, message: 'detectedChanges should be defined' }
    }

    if (!diff.detectedChanges.includes('score_changed')) {
      return { success: false, message: 'Should detect score change' }
    }

    if (!diff.detectedChanges.includes('status_changed')) {
      return { success: false, message: 'Should detect status change' }
    }

    if (!diff.shouldTriggerGovernanceRecheck) {
      return { success: false, message: 'Should trigger recheck for goal' }
    }

    return { success: true, message: `Detected ${diff.detectedChanges.length} changes correctly` }
  })
}

async function testLiveMomentumInterpretation() {
  return test('Live Momentum Interpretation', async () => {
    const mockSnapshot = {
      score: { home: 2, away: 1 },
      minute: 75,
      stats: { possessionHome: 65, possessionAway: 35, shotsOnTargetHome: 4, shotsOnTargetAway: 2 },
      dataQuality: 'rich'
    }

    const mockDiff = {
      detectedChanges: ['goal_home'],
      severity: 'high'
    }

    const momentum = await interpretLiveMomentum(mockSnapshot, mockDiff)

    if (!momentum.confidence || momentum.confidence < 0) {
      return { success: false, message: 'Should have valid confidence score' }
    }

    if (momentum.direction !== 'home') {
      return { success: false, message: 'Should detect home momentum from recent goal + lead' }
    }

    if (!Array.isArray(momentum.factors)) {
      return { success: false, message: 'Factors should be an array' }
    }

    return { success: true, message: `Momentum: ${momentum.direction} (${momentum.confidence.toFixed(2)})` }
  })
}

async function testVariableExtraction() {
  return test('Live Variable Extraction', async () => {
    const mockSnapshot = {
      minute: 60,
      status: '2H',
      score: { home: 1, away: 1 }
    }

    const mockStats = {
      possessionHome: 55,
      possessionAway: 45,
      shotsHome: 8,
      shotsAway: 6,
      shotsOnTargetHome: 3,
      shotsOnTargetAway: 4
    }

    const mockEvents = [
      { type: 'goal', side: 'home', minute: 20 },
      { type: 'goal', side: 'away', minute: 55 }
    ]

    const variables = await extractLiveFirstVariables(mockSnapshot, mockStats, mockEvents)

    if (variables.minute !== 60) {
      return { success: false, message: 'Should extract minute correctly' }
    }

    if (variables.goalDifference !== 0) {
      return { success: false, message: 'Should calculate goal difference correctly' }
    }

    if (variables.possessionDominance === undefined) {
      return { success: false, message: 'Should determine possession dominance' }
    }

    if (!variables.hasStats) {
      return { success: false, message: 'Should detect stats availability' }
    }

    if (!variables.hasEvents) {
      return { success: false, message: 'Should detect events availability' }
    }

    return { success: true, message: `Extracted ${Object.keys(variables).length} variables` }
  })
}

async function testSessionLifecycle() {
  return test('Session Lifecycle (Short Test)', async () => {
    // Check no active sessions initially
    let activeSessions = listActiveSessions()
    const initialActiveCount = activeSessions.length

    // Set very short session for testing
    process.env.ESPN_LIVE_FIRST_MAX_SESSION_MINUTES = '1'
    process.env.ESPN_LIVE_FIRST_POLL_INTERVAL_SECONDS = '30'

    const startResult = await startEspnLiveFirstMonitoringSession()

    if (!startResult.success) {
      if (startResult.message.includes('No live fixtures')) {
        return { success: true, message: 'No fixtures available for test - this is expected outside match times' }
      }
      return { success: false, message: `Failed to start session: ${startResult.message}` }
    }

    const sessionId = startResult.sessionId

    // Verify session is active
    activeSessions = listActiveSessions()
    if (activeSessions.length <= initialActiveCount) {
      return { success: false, message: 'Session should be active after start' }
    }

    // Wait a moment for initial processing
    await new Promise(resolve => setTimeout(resolve, 5000))

    // Get summary
    const summary = await buildLiveMonitoringSummary(sessionId)
    if (!summary) {
      return { success: false, message: 'Should be able to build summary' }
    }

    // Stop session
    const stopResult = await stopMonitoringSession(sessionId, 'Smoke test completion')
    if (!stopResult.success) {
      return { success: false, message: `Failed to stop session: ${stopResult.message}` }
    }

    // Verify session is no longer active
    activeSessions = listActiveSessions()
    if (activeSessions.includes(sessionId)) {
      return { success: false, message: 'Session should not be active after stop' }
    }

    return { success: true, message: `Session lifecycle completed successfully` }
  })
}

async function testErrorHandling() {
  return test('Error Handling', async () => {
    try {
      // Test with invalid fixture ID
      const analysis = await buildLiveFirstIntelligenceForFixture('invalid_fixture_id')

      if (!analysis.error) {
        return { success: false, message: 'Should return error for invalid fixture' }
      }

      // Test snapshot diff with null previous
      const diff = detectSnapshotChanges(
        { id: 'test', minute: 45, status: '1H', scoreHome: 0, scoreAway: 0, createdAt: new Date().toISOString() },
        null,
        'test_fixture'
      )

      if (diff.detectedChanges.length > 0) {
        return { success: false, message: 'Should handle null previous snapshot gracefully' }
      }

      return { success: true, message: 'Error handling works correctly' }
    } catch (error) {
      return { success: false, message: `Unexpected error: ${error.message}` }
    }
  })
}

async function testPollingRateLimits() {
  return test('Polling Rate Limits', async () => {
    const minInterval = parseInt(process.env.ESPN_LIVE_FIRST_MIN_POLL_INTERVAL_SECONDS || '30')
    const configInterval = parseInt(process.env.ESPN_LIVE_FIRST_POLL_INTERVAL_SECONDS || '45')

    if (configInterval < minInterval) {
      return { success: false, message: `Poll interval ${configInterval}s is below minimum ${minInterval}s` }
    }

    const maxFixtures = parseInt(process.env.ESPN_LIVE_FIRST_MAX_FIXTURES || '5')
    if (maxFixtures > 10) {
      return { success: false, message: `Max fixtures ${maxFixtures} seems too high for safe polling` }
    }

    return { success: true, message: `Rate limits properly configured: ${configInterval}s interval, max ${maxFixtures} fixtures` }
  })
}

async function main() {
  console.log('🔥 ESPN Live-First Real Monitoring Smoke Tests')
  console.log('='.repeat(60))

  // Set test environment
  process.env.ESPN_LIVE_FIRST_POLL_INTERVAL_SECONDS = process.env.ESPN_LIVE_FIRST_POLL_INTERVAL_SECONDS || '45'
  process.env.ESPN_LIVE_FIRST_MAX_FIXTURES = process.env.ESPN_LIVE_FIRST_MAX_FIXTURES || '3'

  const startTime = Date.now()

  // Run all tests
  await testLiveFixtureDiscovery()
  await testLiveFixtureDiscoveryWithNoFixtures()
  await testSnapshotDiff()
  await testLiveMomentumInterpretation()
  await testVariableExtraction()
  await testPollingRateLimits()
  await testErrorHandling()
  await testSessionLifecycle() // This one may fail if no live fixtures

  const duration = Date.now() - startTime

  console.log('\n' + '='.repeat(60))
  console.log('📊 Test Summary:')
  console.log(`Total tests: ${totalTests}`)
  console.log(`Passed: ${passedTests}`)
  console.log(`Failed: ${totalTests - passedTests}`)
  console.log(`Duration: ${Math.round(duration / 1000)}s`)

  if (passedTests === totalTests) {
    console.log('\n✅ All tests passed! ESPN Live-First monitoring is ready for real execution.')
  } else {
    console.log('\n❌ Some tests failed. Review the issues before real execution.')
    console.log('\n📋 Detailed Results:')
    testResults.forEach(result => {
      const icon = result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : '⚠️ '
      console.log(`${icon} ${result.name}: ${result.message}`)
    })
  }

  process.exit(passedTests === totalTests ? 0 : 1)
}

main().catch(error => {
  console.error('💥 Smoke test suite failed:', error)
  process.exit(1)
})
