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
  controlPlaneDataState?: 'missing_firebase_env' | 'firebase_permission_denied' | 'empty_firestore' | 'fresh' | 'slightly_stale' | 'stale' | 'empty' | 'unknown'
  firebaseEnv?: {
    projectIdPresent: boolean
    apiKeyPresent: boolean
    authDomainPresent: boolean
    appIdPresent: boolean
    requiredMissing: string[]
    optionalMissing: string[]
    firebaseReadableUnknown: boolean
    firebaseReadable: boolean | null
    status: string
    limitations: string[]
  }
  firebaseReadDiagnostic?: {
    firebaseEnvValid: boolean
    firebaseInitialized: boolean
    workerRunsReadable: boolean
    sessionsReadable: boolean
    leasesReadable: boolean
    dailyReportsReadable: boolean
    causalCasesReadable: boolean
    permissionDenied: boolean
    missingIndex: boolean
    emptyCollections: string[]
    lastErrorSafe: string | null
    freshnessStatus: string
    limitations: string[]
    // B66 public read model hardening fields
    publicReadModelEnabled?: boolean
    publicSummaryReadable?: boolean
    rawFallbackEnabled?: boolean
    rawCollectionsReadable?: boolean
    rawPublicExposureWarning?: string | null
    sanitizedSnapshotFreshness?: string | null
    sanitizedSnapshotGeneratedAt?: string | null
    missingPublicSummary?: boolean
    permissionDeniedPublicSummary?: boolean
    controlPlaneDataMode?: 'sanitized_read_model' | 'raw_fallback' | 'missing_public_summary' | 'permission_denied'
    publicExposure?: 'minimal' | 'transitional_raw_read' | 'blocked' | 'unknown'
  }
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
