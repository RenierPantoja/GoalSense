import {
  detectRuntimeEnvironment,
  explainRuntimeGuardDecision,
  isPersistentWorkerAllowed,
  isReadOnlyControlPlane,
} from './_runtimeGuard.js';

type FirestoreValue = { stringValue?: string; integerValue?: string; doubleValue?: number; booleanValue?: boolean; nullValue?: null; arrayValue?: { values?: FirestoreValue[] }; mapValue?: { fields?: Record<string, FirestoreValue> } };

function fieldValue(value: FirestoreValue | undefined): any {
  if (!value) return undefined;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue || 0);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('arrayValue' in value) return (value.arrayValue?.values || []).map(fieldValue);
  if ('mapValue' in value) {
    return Object.fromEntries(Object.entries(value.mapValue?.fields || {}).map(([key, item]) => [key, fieldValue(item)]));
  }
  return null;
}

function docData(doc: any) {
  const fields = doc?.fields || {};
  const data = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, fieldValue(value as FirestoreValue)]));
  return { id: String(doc?.name || '').split('/').pop() || data.id, ...data };
}

async function listCollection(collection: string, orderField: string, limit: number) {
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
  const apiKey = process.env.VITE_FIREBASE_API_KEY;
  if (!projectId || !apiKey) {
    return { ok: false as const, items: [], limitation: 'firebase_public_read_env_missing' };
  }
  const url = new URL(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${collection}`);
  url.searchParams.set('pageSize', String(limit));
  url.searchParams.set('orderBy', `${orderField} desc`);
  url.searchParams.set('key', apiKey);
  const response = await fetch(url, { cache: 'no-store' }).catch(() => null);
  if (!response || !response.ok) {
    return { ok: false as const, items: [], limitation: `firebase_public_read_failed_${response?.status || 'network'}` };
  }
  const json = await response.json();
  return { ok: true as const, items: (json.documents || []).map(docData), limitation: null };
}

export async function getControlPlaneStatusReadModel() {
  const [runs, sessions, leases, recoveryReports, outcomes, reports] = await Promise.all([
    listCollection('espnLiveFirstWorkerRuns', 'startedAt', 20),
    listCollection('liveMonitoringSessions', 'startedAt', 50),
    listCollection('espnLiveFirstFixtureLeases', 'heartbeatAt', 200),
    listCollection('espnLiveFirstRecoveryReports', 'generatedAt', 10),
    listCollection('liveFirstPostMatchOutcomes', 'createdAt', 50),
    listCollection('dailyValidationReports', 'generatedAt', 5),
  ]);
  const limitations = [runs, sessions, leases, recoveryReports, outcomes, reports]
    .map(result => result.limitation)
    .filter(Boolean) as string[];
  const activeLeases = leases.items.filter((lease: any) => lease.status === 'active');
  const completedOutcomes = outcomes.items.filter((outcome: any) => outcome.evaluable);

  return {
    generatedAt: new Date().toISOString(),
    runtime: {
      environment: detectRuntimeEnvironment(),
      readOnlyControlPlane: isReadOnlyControlPlane(),
      persistentWorkerAllowed: isPersistentWorkerAllowed(),
    },
    readOnly: isReadOnlyControlPlane(),
    active: null,
    workerRuns: runs.items,
    runs: runs.items,
    sessions: sessions.items,
    leases: leases.items,
    recoveryReports: recoveryReports.items,
    postMatchOutcomes: outcomes.items,
    latestDailyReport: reports.items[0] || null,
    latestCausalCases: outcomes.items.slice(0, 20),
    latestRecoveryReport: recoveryReports.items[0] || null,
    sessionsRunning: sessions.items.filter((session: any) => session.status === 'running').length,
    fixturesActive: activeLeases.length,
    orphanSessions: recoveryReports.items[0]?.orphanedSessionsFound || 0,
    completedFixtures: completedOutcomes.length,
    postMatchPending: Math.max(
      0,
      sessions.items.filter((session: any) => session.status === 'completed' || session.status === 'completed_with_warnings')
        .reduce((sum: number, session: any) => sum + (session.fixtureIds?.length || 0), 0) - outcomes.items.length,
    ),
    commandGuard: {
      startWorker: explainRuntimeGuardDecision('start_worker'),
      readStatus: explainRuntimeGuardDecision('read_status'),
      recoverySweep: explainRuntimeGuardDecision('recovery_sweep'),
      postMatchSweeper: explainRuntimeGuardDecision('post_match_sweeper'),
    },
    limitations: [
      'Vercel control-plane read model is read-only and never starts persistent workers.',
      'No odds, Telegram, auto-bet, stake, or enforce changes.',
      ...limitations,
    ],
  };
}

export async function getControlPlaneReadinessModel() {
  const status = await getControlPlaneStatusReadModel();
  return {
    ok: true,
    generatedAt: status.generatedAt,
    frontendReady: true,
    firebaseReadable: !status.limitations.some((item: string) => item.startsWith('firebase_public_read_failed') || item === 'firebase_public_read_env_missing'),
    workerCommandAllowed: !status.readOnly,
    persistentWorkerAllowed: status.runtime.persistentWorkerAllowed,
    readOnlyControlPlane: status.readOnly,
    latestWorkerRunVisibleFromControlPlane: status.workerRuns.length > 0,
    latestDailyReportVisibleFromControlPlane: !!status.latestDailyReport,
    latestCausalCasesVisibleFromControlPlane: status.latestCausalCases.length > 0,
    limitations: status.limitations,
    nextActions: status.readOnly
      ? ['Use Vercel as UI/control plane.', 'Run ESPN Live-First worker via local or dedicated CLI runtime.']
      : ['Verify runtime flags before starting worker commands.'],
  };
}
