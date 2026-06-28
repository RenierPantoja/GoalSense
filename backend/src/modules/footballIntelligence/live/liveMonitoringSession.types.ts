/**
 * Live Monitoring Session Types — B57 ESPN Live-First Real Monitoring
 * ─────────────────────────────────────────────────────────────────────────────
 * Contracts for trackable live monitoring sessions with real ESPN data.
 * Sessions turn live monitoring into auditable, bounded operations.
 */

export type LiveMonitoringSessionStatus =
  | 'running'
  | 'completed'
  | 'completed_with_warnings'
  | 'failed'
  | 'cancelled'

export type LiveMonitoringMode =
  | 'espn_live_first'
  | 'api_football_live' // future
  | 'hybrid_live' // future

export interface LiveMonitoringSession {
  id: string
  startedAt: string
  endedAt?: string | null
  status: LiveMonitoringSessionStatus
  fixtureIds: string[]
  mode: LiveMonitoringMode
  pollIntervalSeconds: number
  maxDurationMinutes: number
  snapshotsCaptured: number
  governanceEvaluations: number
  liveRechecks: number
  errors: string[]
  warnings: string[]
  limitations: string[]
  createdAt: string
  updatedAt: string
}

export interface LiveMonitoringFixtureState {
  id: string
  sessionId: string
  fixtureId: string
  firstSnapshotAt?: string | null
  lastSnapshotAt?: string | null
  snapshotCount: number
  lastStatus?: string | null
  lastMinute?: number | null
  lastScore?: { home: number; away: number } | null
  freshness?: 'fresh' | 'stale' | 'unknown'
  delayEstimateMs?: number | null
  eventsDetected: number
  rechecksTriggered: number
  completed: boolean
  limitations: string[]
  createdAt: string
  updatedAt: string
}

// Live Snapshot Diff for event detection
export interface LiveSnapshotDiff {
  fixtureId: string
  previousSnapshotId?: string | null
  currentSnapshotId: string
  detectedChanges: LiveSnapshotChangeType[]
  severity: 'low' | 'medium' | 'high'
  shouldTriggerGovernanceRecheck: boolean
  reasons: string[]
  limitations: string[]
  createdAt: string
}

export type LiveSnapshotChangeType =
  | 'score_changed'
  | 'goal_home'
  | 'goal_away'
  | 'red_card_home'
  | 'red_card_away'
  | 'yellow_card'
  | 'substitution'
  | 'injury_event'
  | 'status_changed'
  | 'halftime'
  | 'fulltime'
  | 'stats_shift'
  | 'possession_shift'
  | 'shots_shift'
  | 'pressure_shift'
  | 'minute_changed'
  | 'new_events'

// Live fixture selection criteria
export interface LiveFixtureSelectionResult {
  totalFound: number
  selected: Array<{
    fixtureId: string
    teams: string
    competition: string
    status: string
    minute?: number | null
    score: { home: number; away: number }
    dataAvailability: 'rich' | 'partial' | 'poor'
    selectionReason: string
    limitations: string[]
  }>
  skipped: Array<{
    fixtureId: string
    reason: string
  }>
  limitations: string[]
}

// Live monitoring config
export interface LiveMonitoringConfig {
  pollIntervalSeconds: number
  minPollIntervalSeconds: number
  maxFixtures: number
  maxSessionMinutes: number
  stopOnFullTime: boolean
  enableEnrichment: boolean
  maxEnrichmentFixtures: number
}

// Live monitoring result
export interface LiveMonitoringResult {
  sessionId: string
  status: LiveMonitoringSessionStatus
  duration: string
  fixtures: {
    discovered: number
    selected: number
    monitored: number
    completed: number
  }
  snapshots: {
    captured: number
    rich: number
    partial: number
    poor: number
  }
  events: {
    detected: number
    rechecksTriggered: number
    governanceEvaluations: number
  }
  errors: string[]
  warnings: string[]
  limitations: string[]
}