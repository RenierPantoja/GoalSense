/**
 * ESPN Live-First Worker Types — B59 Persistent Worker
 * ─────────────────────────────────────────────────────────────────────────────
 * Types for persistent worker runs, leases, recovery, and post-match sweeper.
 */
import type { LiveMonitoringSessionStatus } from './liveMonitoringSession.types.js'

// Worker status
export type EspnLiveFirstWorkerStatus =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'paused'
  | 'completed'
  | 'completed_with_warnings'
  | 'failed'
  | 'recovered'
  | 'cancelled'

// Worker mode
export type EspnLiveFirstWorkerMode =
  | 'local_manual'        // Started manually by user
  | 'local_scheduled'     // Started by cron/scheduler
  | 'recovery'            // Recovered orphaned session
  | 'post_match_sweeper'  // Post-match cleanup

// Worker run
export interface EspnLiveFirstWorkerRun {
  id: string
  startedAt: string
  stoppedAt?: string | null
  status: EspnLiveFirstWorkerStatus
  mode: EspnLiveFirstWorkerMode
  heartbeatAt: string
  leaseExpiresAt: string
  processId: string
  hostId: string
  fixtureIds: string[]
  sessionId?: string | null
  pollIntervalSeconds: number
  maxFixtures: number
  maxDurationMinutes: number
  snapshotsCaptured: number
  rechecksTriggered: number
  postMatchResolved: number
  errors: string[]
  warnings: string[]
  limitations: string[]
  createdAt: string
  updatedAt: string
}

// Fixture lease
export type EspnLiveFirstFixtureLeaseStatus =
  | 'active'
  | 'released'
  | 'expired'
  | 'completed'
  | 'orphaned'

export interface EspnLiveFirstFixtureLease {
  id: string
  fixtureId: string
  sessionId: string
  workerRunId: string
  acquiredAt: string
  heartbeatAt: string
  leaseExpiresAt: string
  status: EspnLiveFirstFixtureLeaseStatus
  owner: string // processId + hostId
  limitations: string[]
  createdAt: string
  updatedAt: string
}

// Recovery report
export interface EspnLiveFirstRecoveryReport {
  id: string
  generatedAt: string
  orphanedSessionsFound: number
  orphanedFixturesFound: number
  recoveredSessions: string[]
  closedSessions: string[]
  skippedSessions: string[]
  reasons: string[]
  limitations: string[]
}

// Worker run options
export interface StartWorkerOptions {
  mode?: EspnLiveFirstWorkerMode
  maxDurationMinutes?: number
  maxFixtures?: number
  pollIntervalSeconds?: number
}

// Worker run summary
export interface EspnLiveFirstWorkerRunSummary {
  workerRunId: string
  status: EspnLiveFirstWorkerStatus
  mode: EspnLiveFirstWorkerMode
  durationMinutes: number
  startedAt: string
  stoppedAt?: string | null
  heartbeatAt: string
  processId: string
  hostId: string
  fixtures: number
  snapshots: number
  rechecks: number
  postMatchResolved: number
  errors: string[]
  warnings: string[]
  limitations: string[]
}

// Orphan detection result
export interface OrphanDetectionResult {
  sessions: Array<{
    sessionId: string
    sessionStatus: LiveMonitoringSessionStatus
    lastHeartbeat: string
    fixtures: string[]
    leaseStatus: EspnLiveFirstFixtureLeaseStatus | 'none'
    recoverable: boolean
    reason: string
  }>
  orphanedFixtures: string[]
  totalOrphanedSessions: number
  totalOrphanedFixtures: number
  canRecover: boolean
}

// Post-match sweeper result
export interface PostMatchSweeperResult {
  fixturesProcessed: number
  outcomesResolved: number
  causalCasesCreated: number
  evaluableCases: number
  notEvaluableCases: number
  notEvaluableReasons: Record<string, string[]>
  errors: string[]
  warnings: string[]
  limitations: string[]
}

// Live-first causal case outcome classification
export type LiveFirstCausalCaseOutcome =
  | 'live_best_effort_correct'      // Outcome matched prediction
  | 'live_best_effort_limited'      // Outcome matched but data limited
  | 'live_data_insufficient'        // Not enough data to evaluate
  | 'live_event_changed_game'       // Unexpected event changed outcome
  | 'missing_pre_match_limited_analysis' // Pre-match data missing
  | 'not_evaluable_unknown_outcome' // Outcome not determinable

// Live-first post-match outcome
export interface LiveFirstPostMatchOutcome {
  fixtureId: string
  sessionId: string
  finalStatus: string
  finalScore: { home: number | null; away: number | null }
  outcome: LiveFirstCausalCaseOutcome
  evaluable: boolean
  reason: string
  governanceEvaluations: number
  governanceAccuracy?: {
    correct: number
    incorrect: number
    inconclusive: number
  }
  snapshotCount: number
  eventsDetected: number
  limitations: string[]
  createdAt: string
}
