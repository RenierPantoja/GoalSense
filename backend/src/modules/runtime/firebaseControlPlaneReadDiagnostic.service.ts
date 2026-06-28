import { getFirebaseControlPlaneEnvStatus } from './firebaseControlPlaneEnv.service.js'

export interface FirebaseReadTargetDiagnostic {
  collection: string
  readable: boolean
  empty: boolean
  count: number
  permissionDenied: boolean
  missingIndex: boolean
  lastErrorSafe: string | null
}

export interface FirebaseControlPlaneReadReport {
  generatedAt: string
  readOnly: true
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
  freshnessStatus: 'missing_firebase_env' | 'permission_denied' | 'empty_firestore' | 'readable'
  targets: FirebaseReadTargetDiagnostic[]
  limitations: string[]
}

const TARGETS = [
  ['espnLiveFirstWorkerRuns', 'workerRunsReadable'],
  ['liveMonitoringSessions', 'sessionsReadable'],
  ['espnLiveFirstFixtureLeases', 'leasesReadable'],
  ['dailyValidationReports', 'dailyReportsReadable'],
  ['liveFirstPostMatchOutcomes', 'causalCasesReadable'],
] as const

export async function buildControlPlaneFirebaseReadReport(): Promise<FirebaseControlPlaneReadReport> {
  const envStatus = getFirebaseControlPlaneEnvStatus()
  if (envStatus.requiredMissing.length > 0) {
    return {
      generatedAt: new Date().toISOString(),
      readOnly: true,
      firebaseEnvValid: false,
      firebaseInitialized: false,
      workerRunsReadable: false,
      sessionsReadable: false,
      leasesReadable: false,
      dailyReportsReadable: false,
      causalCasesReadable: false,
      permissionDenied: false,
      missingIndex: false,
      emptyCollections: [],
      lastErrorSafe: 'missing_firebase_env',
      freshnessStatus: 'missing_firebase_env',
      targets: [],
      limitations: ['Firebase public env is missing; this is distinct from an empty Firestore.'],
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    firebaseEnvValid: true,
    firebaseInitialized: true,
    workerRunsReadable: false,
    sessionsReadable: false,
    leasesReadable: false,
    dailyReportsReadable: false,
    causalCasesReadable: false,
    permissionDenied: false,
    missingIndex: false,
    emptyCollections: [],
    lastErrorSafe: null,
    freshnessStatus: 'empty_firestore',
    targets: TARGETS.map(([collection]) => ({
      collection,
      readable: false,
      empty: true,
      count: 0,
      permissionDenied: false,
      missingIndex: false,
      lastErrorSafe: 'diagnostic_requires_serverless_rest_read',
    })),
    limitations: ['Backend diagnostic reports env safety; Vercel serverless route performs REST read checks.'],
  }
}

export const testControlPlaneFirebaseRead = buildControlPlaneFirebaseReadReport
export const testWorkerRunsRead = buildControlPlaneFirebaseReadReport
export const testLiveSessionsRead = buildControlPlaneFirebaseReadReport
export const testLeasesRead = buildControlPlaneFirebaseReadReport
export const testDailyReportsRead = buildControlPlaneFirebaseReadReport
export const testCausalCasesRead = buildControlPlaneFirebaseReadReport
