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
  active: unknown
  runs: EspnLiveFirstWorkerRunDto[]
  sessions: Array<{ id: string; status: string; fixtureIds: string[]; snapshotsCaptured: number; liveRechecks: number; limitations: string[] }>
  leases: EspnLiveFirstLeaseDto[]
  recoveryReports: Array<{ id: string; generatedAt: string; orphanedSessionsFound: number; recoveredSessions: string[]; closedSessions: string[]; limitations: string[] }>
  postMatchOutcomes: Array<{ fixtureId: string; sessionId: string; evaluable: boolean; reason: string; snapshotCount: number; limitations: string[] }>
  sessionsRunning: number
  fixturesActive: number
  orphanSessions: number
  completedFixtures: number
  postMatchPending: number
  limitations: string[]
}
