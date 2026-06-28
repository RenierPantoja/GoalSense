import { getFirebaseControlPlaneEnvStatus } from './_firebaseControlPlaneEnv.js';

type TargetName = 'workerRunsReadable' | 'sessionsReadable' | 'leasesReadable' | 'dailyReportsReadable' | 'causalCasesReadable';

const TARGETS: Array<{ collection: string; flag: TargetName }> = [
  { collection: 'espnLiveFirstWorkerRuns', flag: 'workerRunsReadable' },
  { collection: 'liveMonitoringSessions', flag: 'sessionsReadable' },
  { collection: 'espnLiveFirstFixtureLeases', flag: 'leasesReadable' },
  { collection: 'dailyValidationReports', flag: 'dailyReportsReadable' },
  { collection: 'liveFirstPostMatchOutcomes', flag: 'causalCasesReadable' },
];

function safeError(status: number): string {
  if (status === 403) return 'permission_denied';
  if (status === 400) return 'bad_request_or_missing_index';
  if (status === 404) return 'collection_or_database_not_found';
  return `firebase_read_failed_${status}`;
}

async function readCollection(collection: string) {
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
  const apiKey = process.env.VITE_FIREBASE_API_KEY;
  const url = new URL(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(String(projectId))}/databases/(default)/documents/${collection}`);
  url.searchParams.set('pageSize', '1');
  url.searchParams.set('key', String(apiKey));
  const response = await fetch(url, { cache: 'no-store' }).catch(() => null);
  if (!response) {
    return { collection, readable: false, empty: false, count: 0, permissionDenied: false, missingIndex: false, lastErrorSafe: 'network_error' };
  }
  if (!response.ok) {
    return {
      collection,
      readable: false,
      empty: false,
      count: 0,
      permissionDenied: response.status === 403,
      missingIndex: response.status === 400,
      lastErrorSafe: safeError(response.status),
    };
  }
  const json = await response.json().catch(() => ({}));
  const count = Array.isArray(json.documents) ? json.documents.length : 0;
  return { collection, readable: true, empty: count === 0, count, permissionDenied: false, missingIndex: false, lastErrorSafe: null };
}

export async function buildControlPlaneFirebaseReadReport() {
  const env = getFirebaseControlPlaneEnvStatus();
  if (env.requiredMissing.length > 0) {
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
      env,
      targets: [],
      limitations: ['Missing Firebase public env is distinct from an empty Firestore.'],
    };
  }

  const targets = await Promise.all(TARGETS.map(target => readCollection(target.collection)));
  const emptyCollections = targets.filter(target => target.readable && target.empty).map(target => target.collection);
  const permissionDenied = targets.some(target => target.permissionDenied);
  const missingIndex = targets.some(target => target.missingIndex);
  const lastErrorSafe = targets.find(target => target.lastErrorSafe)?.lastErrorSafe || null;
  const anyReadable = targets.some(target => target.readable);
  const anyNonEmpty = targets.some(target => target.readable && !target.empty);
  const flags = Object.fromEntries(TARGETS.map(target => [
    target.flag,
    targets.find(item => item.collection === target.collection)?.readable === true,
  ]));

  return {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    firebaseEnvValid: true,
    firebaseInitialized: true,
    ...flags,
    permissionDenied,
    missingIndex,
    emptyCollections,
    lastErrorSafe,
    freshnessStatus: permissionDenied ? 'permission_denied' : anyNonEmpty ? 'readable' : anyReadable ? 'empty_firestore' : 'stale',
    env: { ...env, firebaseReadable: anyReadable, firebaseReadableUnknown: false },
    targets,
    limitations: [
      'Diagnostic is read-only and never writes to Firebase.',
      'Empty collections are not failures.',
      ...(permissionDenied ? ['Firebase Rules denied at least one control-plane read.'] : []),
    ],
  };
}

export const testControlPlaneFirebaseRead = buildControlPlaneFirebaseReadReport;
export const testWorkerRunsRead = buildControlPlaneFirebaseReadReport;
export const testLiveSessionsRead = buildControlPlaneFirebaseReadReport;
export const testLeasesRead = buildControlPlaneFirebaseReadReport;
export const testDailyReportsRead = buildControlPlaneFirebaseReadReport;
export const testCausalCasesRead = buildControlPlaneFirebaseReadReport;
