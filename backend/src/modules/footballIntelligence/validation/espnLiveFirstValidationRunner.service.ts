/**
 * ESPN Live-First Validation Runner — B57 Integration with Local Validation
 * ─────────────────────────────────────────────────────────────────────────────
 * Integrates ESPN Live-First monitoring with the existing validation framework.
 * Creates validation sessions that track live monitoring for audit purposes.
 */
import { createRepositories } from '../../../repositories/index.js'
import { startEspnLiveFirstMonitoringSession, buildLiveMonitoringSummary } from '../live/espnLiveFirstMonitoringRunner.service.js'
import { discoverLiveFixturesNow } from '../live/espnLiveFixtureDiscovery.service.js'
import type { LiveValidationSession, LiveValidationSessionEvent } from '../../validation/liveValidation.types.js'

/**
 * Run ESPN Live-First validation with proper session tracking
 */
export async function runEspnLiveFirstValidationNow(): Promise<{
  success: boolean
  validationSessionId?: string
  liveMonitoringSessionId?: string
  message: string
  summary?: any
}> {
  const repos = createRepositories()

  try {
    // Create validation session for audit trail
    const validationSession: any = {
      id: `espn_live_first_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      name: `ESPN Live-First Real Validation ${new Date().toLocaleDateString()}`,
      status: 'running',
      mode: 'espn_live_first',
      startedAt: new Date().toISOString(),
      fixtureIds: [],
      selectedFixtures: 0,
      skippedFixtures: 0,
      errors: [],
      warnings: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    // Discover available fixtures first
    const discovery = await discoverLiveFixturesNow()

    if (discovery.selected.length === 0) {
      await repos.intelligence.createLiveValidationSession({
        ...validationSession,
        status: 'completed',
        endedAt: new Date().toISOString(),
        skippedFixtures: discovery.totalFound,
        warnings: ['No live fixtures available for validation', ...discovery.limitations]
      } as any)

      return {
        success: false,
        validationSessionId: validationSession.id,
        message: `No live fixtures found. Total discovered: ${discovery.totalFound}`
      }
    }

    // Update validation session with fixture info
    validationSession.fixtureIds = discovery.selected.map(f => f.fixtureId)
    validationSession.selectedFixtures = discovery.selected.length
    validationSession.skippedFixtures = discovery.skipped.length
    validationSession.warnings = discovery.limitations

    await repos.intelligence.createLiveValidationSession(validationSession)

    // Log validation start event
    await repos.intelligence.createLiveValidationSessionEvent({
      id: `evt_${validationSession.id}_start`,
      validationSessionId: validationSession.id,
      type: 'session_started',
      message: `ESPN Live-First validation started with ${discovery.selected.length} fixtures`,
      data: { discovery },
      createdAt: new Date().toISOString()
    } as any)

    // Start live monitoring session
    const monitoringResult = await startEspnLiveFirstMonitoringSession()

    if (!monitoringResult.success) {
      // Update validation session as failed
      await repos.intelligence.updateLiveValidationSession(validationSession.id, {
        status: 'failed_non_fatal',
        endedAt: new Date().toISOString(),
        errors: [`Failed to start monitoring: ${monitoringResult.message}`]
      } as any)

      await repos.intelligence.createLiveValidationSessionEvent({
        id: `evt_${validationSession.id}_failed`,
        validationSessionId: validationSession.id,
        type: 'worker_error',
        message: `Monitoring session failed to start: ${monitoringResult.message}`,
        createdAt: new Date().toISOString()
      } as any)

      return {
        success: false,
        validationSessionId: validationSession.id,
        message: `Failed to start monitoring: ${monitoringResult.message}`
      }
    }

    // Link monitoring session to validation session
    await repos.intelligence.createLiveValidationSessionEvent({
      id: `evt_${validationSession.id}_monitoring`,
      validationSessionId: validationSession.id,
      type: 'session_started',
      message: `Live monitoring session ${monitoringResult.sessionId} started`,
      data: { monitoringSessionId: monitoringResult.sessionId },
      createdAt: new Date().toISOString()
    } as any)

    // Wait for initial monitoring data (30 seconds)
    await new Promise(resolve => setTimeout(resolve, 30000))

    // Get initial summary
    const summary = monitoringResult.sessionId
      ? await buildLiveMonitoringSummary(monitoringResult.sessionId)
      : null

    if (summary) {
      await repos.intelligence.createLiveValidationSessionEvent({
        id: `evt_${validationSession.id}_summary`,
        validationSessionId: validationSession.id,
        type: 'snapshot_written',
        message: `Initial monitoring summary: ${summary.snapshots.captured} snapshots, ${summary.events.detected} events`,
        data: { summary },
        createdAt: new Date().toISOString()
      } as any)
    }

    return {
      success: true,
      validationSessionId: validationSession.id,
      liveMonitoringSessionId: monitoringResult.sessionId,
      message: `Validation started with ${discovery.selected.length} fixtures. Live monitoring: ${monitoringResult.sessionId}`,
      summary
    }

  } catch (error: any) {
    return {
      success: false,
      message: `Validation runner failed: ${error?.message || 'unknown'}`
    }
  }
}

/**
 * Complete ESPN Live-First validation session
 */
export async function completeEspnLiveFirstValidation(
  validationSessionId: string,
  liveMonitoringSessionId: string
): Promise<{
  success: boolean
  message: string
  report?: any
}> {
  const repos = createRepositories()

  try {
    // Get final monitoring summary
    const summary = await buildLiveMonitoringSummary(liveMonitoringSessionId)

    // Update validation session as completed
    await repos.intelligence.updateLiveValidationSession(validationSessionId, {
      status: 'completed',
      endedAt: new Date().toISOString(),
      errors: summary?.errors || [],
      warnings: summary?.warnings || []
    } as any)

    // Create completion event
    await repos.intelligence.createLiveValidationSessionEvent({
      id: `evt_${validationSessionId}_complete`,
      validationSessionId,
      type: 'session_completed',
      message: `Validation completed. Final summary: ${summary?.snapshots.captured || 0} snapshots, ${summary?.events.detected || 0} events`,
      data: { finalSummary: summary },
      createdAt: new Date().toISOString()
    } as any)

    // Generate validation report
    const report = {
      validationSessionId,
      liveMonitoringSessionId,
      duration: summary?.duration || 'unknown',
      fixtures: summary?.fixtures || {},
      snapshots: summary?.snapshots || {},
      events: summary?.events || {},
      quality: summary?.errors.length ? 'partial' : 'good',
      limitations: summary?.limitations || [],
      recommendations: generateValidationRecommendations(summary)
    }

    return {
      success: true,
      message: 'Validation completed successfully',
      report
    }

  } catch (error: any) {
    return {
      success: false,
      message: `Failed to complete validation: ${error?.message || 'unknown'}`
    }
  }
}

function generateValidationRecommendations(summary: any): string[] {
  const recommendations: string[] = []

  if (!summary) {
    recommendations.push('No monitoring summary available - check session logs')
    return recommendations
  }

  if (summary.snapshots.captured < 5) {
    recommendations.push('Low snapshot count - consider longer monitoring duration')
  }

  if (summary.events.detected === 0) {
    recommendations.push('No events detected - validation during more active match periods may provide better data')
  }

  if (summary.events.rechecksTriggered === 0) {
    recommendations.push('No governance rechecks triggered - enable live recheck bridge for better testing')
  }

  if (summary.errors.length > 0) {
    recommendations.push('Errors occurred - review ESPN data availability and network connectivity')
  }

  if (summary.fixtures.completed < summary.fixtures.monitored) {
    recommendations.push('Some fixtures did not complete - consider running validation during full match duration')
  }

  recommendations.push('Run validation across multiple match days for comprehensive coverage')
  recommendations.push('Compare with simulated validation results to assess live-first improvements')

  return recommendations
}