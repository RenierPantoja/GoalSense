export interface EspnLiveFirstWorkerRunDto {
  id: string
  startedAt: string
  stoppedAt?: string | null
  status: string
  mode: string
  heartbeatAt: string
  leaseExpiresAt: string
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
}

export interface EspnLiveFirstLeaseDto {
  fixtureId: string
  sessionId: string
  workerRunId: string
  heartbeatAt: string
  leaseExpiresAt: string
  status: string
  limitations: string[]
}

export interface EspnLiveFirstWorkerStatusDto {
  generatedAt?: string
  source?: string
  active: unknown
  runs: EspnLiveFirstWorkerRunDto[]
  sessions: Array<{ id: string; status: string; fixtureIds: string[]; snapshotsCaptured: number; liveRechecks: number; limitations: string[] }>
  leases: EspnLiveFirstLeaseDto[]
  fixtureStates?: Array<{ id: string; sessionId: string; fixtureId: string; lastSnapshotAt?: string | null; snapshotCount?: number; updatedAt?: string }>
  recoveryReports: Array<{ id: string; generatedAt: string; orphanedSessionsFound: number; recoveredSessions: string[]; closedSessions: string[]; limitations: string[] }>
  postMatchOutcomes: Array<{ fixtureId: string; sessionId: string; evaluable: boolean; reason: string; snapshotCount: number; limitations: string[] }>
  freshness?: {
    latestWorkerHeartbeatAt: string | null
    latestSessionUpdatedAt: string | null
    latestSnapshotAt: string | null
    latestDailyReportAt: string | null
    latestCausalCaseAt: string | null
    freshnessStatus: 'fresh' | 'slightly_stale' | 'stale' | 'empty' | 'unknown'
    staleReasons: string[]
    nextExpectedUpdate: string | null
    lagMs: number | null
    limitations: string[]
  }
  sessionsRunning: number
  fixturesActive: number
  orphanSessions: number
  completedFixtures: number
  postMatchPending: number
  readOnly?: boolean
  runtime?: {
    environment: string
    readOnlyControlPlane: boolean
    persistentWorkerAllowed: boolean
  }
  commandGuard?: Record<string, unknown>
  limitations: string[]
}
