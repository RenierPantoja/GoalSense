/**
 * Live Snapshot Diff Service — B57 Event Detection
 * ─────────────────────────────────────────────────────────────────────────────
 * Compares snapshots to detect real events and changes that should trigger
 * governance rechecks. Never invents missing events.
 */
import type { LiveSnapshotDiff, LiveSnapshotChangeType } from './liveMonitoringSession.types.js'

interface SnapshotData {
  id: string
  minute?: number | null
  status: string
  scoreHome: number
  scoreAway: number
  statsJson?: string | null
  eventsJson?: string | null
  createdAt: string
}

interface DetectedChange {
  type: LiveSnapshotChangeType
  severity: 'low' | 'medium' | 'high'
  shouldTriggerRecheck: boolean
  reason: string
  details?: any
}

/**
 * Compare current snapshot vs previous to detect changes
 */
export function detectSnapshotChanges(
  current: SnapshotData,
  previous: SnapshotData | null,
  fixtureId: string
): LiveSnapshotDiff {
  if (!previous) {
    return {
      fixtureId,
      currentSnapshotId: current.id,
      detectedChanges: [],
      severity: 'low',
      shouldTriggerGovernanceRecheck: false,
      reasons: ['First snapshot - no comparison possible'],
      limitations: [],
      createdAt: new Date().toISOString()
    }
  }

  const changes: DetectedChange[] = []
  const reasons: string[] = []
  const limitations: string[] = []

  // Score changes (can detect without events)
  const scoreChanged =
    current.scoreHome !== previous.scoreHome ||
    current.scoreAway !== previous.scoreAway

  if (scoreChanged) {
    const prevScore = `${previous.scoreHome}-${previous.scoreAway}`
    const currScore = `${current.scoreHome}-${current.scoreAway}`

    changes.push({
      type: 'score_changed',
      severity: 'high',
      shouldTriggerRecheck: true,
      reason: `Score changed from ${prevScore} to ${currScore}`,
      details: {
        previous: { home: previous.scoreHome, away: previous.scoreAway },
        current: { home: current.scoreHome, away: current.scoreAway }
      }
    })

    // Try to determine which team scored
    if (current.scoreHome > previous.scoreHome) {
      changes.push({
        type: 'goal_home',
        severity: 'high',
        shouldTriggerRecheck: true,
        reason: `Home team scored (${previous.scoreHome} → ${current.scoreHome})`
      })
    }
    if (current.scoreAway > previous.scoreAway) {
      changes.push({
        type: 'goal_away',
        severity: 'high',
        shouldTriggerRecheck: true,
        reason: `Away team scored (${previous.scoreAway} → ${current.scoreAway})`
      })
    }

    reasons.push(`Score change detected: ${prevScore} → ${currScore}`)
  }

  // Status changes
  if (current.status !== previous.status) {
    const severity = getStatusChangeSeverity(previous.status, current.status)
    const shouldRecheck = severity === 'high' || severity === 'medium'

    changes.push({
      type: 'status_changed',
      severity,
      shouldTriggerRecheck: shouldRecheck,
      reason: `Status changed from ${previous.status} to ${current.status}`,
      details: { previous: previous.status, current: current.status }
    })

    // Specific status transitions
    if (current.status === 'HT' && previous.status !== 'HT') {
      changes.push({
        type: 'halftime',
        severity: 'medium',
        shouldTriggerRecheck: true,
        reason: 'Half-time reached'
      })
    }
    if (current.status === 'FT' && previous.status !== 'FT') {
      changes.push({
        type: 'fulltime',
        severity: 'high',
        shouldTriggerRecheck: true,
        reason: 'Full-time reached'
      })
    }

    reasons.push(`Status transition: ${previous.status} → ${current.status}`)
  }

  // Minute changes (for live matches)
  if (current.minute !== previous.minute && current.minute !== null) {
    changes.push({
      type: 'minute_changed',
      severity: 'low',
      shouldTriggerRecheck: false,
      reason: `Minute updated: ${previous.minute || '?'} → ${current.minute}`,
      details: { previous: previous.minute, current: current.minute }
    })
  }

  // Events changes (if available)
  const eventsChange = detectEventChanges(current, previous)
  if (eventsChange) {
    changes.push(eventsChange)
    reasons.push(eventsChange.reason)
  }

  // Stats changes (if available)
  const statsChange = detectStatsChanges(current, previous)
  if (statsChange) {
    changes.push(statsChange)
    if (statsChange.shouldTriggerRecheck) {
      reasons.push(statsChange.reason)
    }
  }

  // Determine overall severity and recheck need
  const highSeverityChanges = changes.filter(c => c.severity === 'high')
  const mediumSeverityChanges = changes.filter(c => c.severity === 'medium')
  const recheckTriggers = changes.filter(c => c.shouldTriggerRecheck)

  const overallSeverity =
    highSeverityChanges.length > 0 ? 'high' :
    mediumSeverityChanges.length > 0 ? 'medium' : 'low'

  const shouldTriggerRecheck = recheckTriggers.length > 0

  if (changes.length === 0) {
    reasons.push('No significant changes detected')
  }

  return {
    fixtureId,
    previousSnapshotId: previous.id,
    currentSnapshotId: current.id,
    detectedChanges: changes.map(c => c.type),
    severity: overallSeverity,
    shouldTriggerGovernanceRecheck: shouldTriggerRecheck,
    reasons,
    limitations,
    createdAt: new Date().toISOString()
  }
}

/**
 * Detect changes in events data
 */
function detectEventChanges(
  current: SnapshotData,
  previous: SnapshotData
): DetectedChange | null {
  // Only detect if we have events data
  if (!current.eventsJson && !previous.eventsJson) {
    return null
  }

  try {
    const currentEvents = current.eventsJson ? JSON.parse(current.eventsJson) : []
    const previousEvents = previous.eventsJson ? JSON.parse(previous.eventsJson) : []

    if (!Array.isArray(currentEvents) || !Array.isArray(previousEvents)) {
      return null
    }

    if (currentEvents.length > previousEvents.length) {
      const newEventsCount = currentEvents.length - previousEvents.length

      // Try to identify event types from new events
      const newEvents = currentEvents.slice(previousEvents.length)
      const eventTypes = new Set(newEvents.map(e => e.type).filter(Boolean))

      let severity: 'low' | 'medium' | 'high' = 'medium'
      let changeType: LiveSnapshotChangeType = 'new_events'

      // Classify by event importance
      if (eventTypes.has('goal') || eventTypes.has('red_card')) {
        severity = 'high'
        if (eventTypes.has('goal')) changeType = 'goal_home' // Could be away, but we'll use generic
        if (eventTypes.has('red_card')) changeType = 'red_card_home'
      } else if (eventTypes.has('yellow_card')) {
        changeType = 'yellow_card'
        severity = 'medium'
      } else if (eventTypes.has('substitution')) {
        changeType = 'substitution'
        severity = 'low'
      }

      return {
        type: changeType,
        severity,
        shouldTriggerRecheck: severity !== 'low',
        reason: `New events detected: +${newEventsCount} (${Array.from(eventTypes).join(', ')})`,
        details: {
          newEventsCount,
          previousCount: previousEvents.length,
          currentCount: currentEvents.length,
          newEventTypes: Array.from(eventTypes)
        }
      }
    }
  } catch (error) {
    // Malformed JSON - don't fail the diff
    return null
  }

  return null
}

/**
 * Detect changes in stats data
 */
function detectStatsChanges(
  current: SnapshotData,
  previous: SnapshotData
): DetectedChange | null {
  // Only check if we have stats data
  if (!current.statsJson || !previous.statsJson) {
    return null
  }

  try {
    const currentStats = JSON.parse(current.statsJson)
    const previousStats = JSON.parse(previous.statsJson)

    if (!currentStats || !previousStats) return null

    // Check for possession shifts (>10% change)
    const possessionShift = checkPossessionShift(currentStats, previousStats)
    if (possessionShift) {
      return {
        type: 'possession_shift',
        severity: 'low',
        shouldTriggerRecheck: false,
        reason: possessionShift.reason,
        details: possessionShift.details
      }
    }

    // Check for shots increase (significant activity)
    const shotsShift = checkShotsShift(currentStats, previousStats)
    if (shotsShift) {
      return {
        type: 'shots_shift',
        severity: 'low',
        shouldTriggerRecheck: false,
        reason: shotsShift.reason,
        details: shotsShift.details
      }
    }

  } catch (error) {
    // Malformed JSON - don't fail the diff
    return null
  }

  return null
}

function checkPossessionShift(current: any, previous: any) {
  const currPossH = current.possessionHome
  const currPossA = current.possessionAway
  const prevPossH = previous.possessionHome
  const prevPossA = previous.possessionAway

  if (typeof currPossH !== 'number' || typeof prevPossH !== 'number') return null

  const shift = Math.abs(currPossH - prevPossH)
  if (shift >= 10) {
    return {
      reason: `Possession shift: ${prevPossH}%-${prevPossA}% → ${currPossH}%-${currPossA}%`,
      details: { previous: { home: prevPossH, away: prevPossA }, current: { home: currPossH, away: currPossA } }
    }
  }
  return null
}

function checkShotsShift(current: any, previous: any) {
  const currShotsH = current.shotsHome || 0
  const currShotsA = current.shotsAway || 0
  const prevShotsH = previous.shotsHome || 0
  const prevShotsA = previous.shotsAway || 0

  const totalCurr = currShotsH + currShotsA
  const totalPrev = prevShotsH + prevShotsA
  const increase = totalCurr - totalPrev

  if (increase >= 3) { // 3+ new shots is notable activity
    return {
      reason: `Shots increase: ${totalPrev} → ${totalCurr} (+${increase})`,
      details: {
        previous: { home: prevShotsH, away: prevShotsA, total: totalPrev },
        current: { home: currShotsH, away: currShotsA, total: totalCurr }
      }
    }
  }
  return null
}

function getStatusChangeSeverity(
  previous: string,
  current: string
): 'low' | 'medium' | 'high' {
  // High priority status changes
  if (current === 'FT' || current === 'AET' || current === 'PEN') return 'high'
  if (current === 'HT' && previous !== 'HT') return 'medium'
  if (current === 'SUSP' || current === 'CANC') return 'high'

  // Medium priority
  if (previous === 'NS' && (current === '1H' || current === '2H')) return 'medium'
  if (previous === 'HT' && current === '2H') return 'medium'

  // Low priority (minute-to-minute within same phase)
  return 'low'
}