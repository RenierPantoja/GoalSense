import {
  detectRuntimeEnvironment,
  explainRuntimeGuardDecision,
  isPersistentWorkerAllowed,
  isReadOnlyControlPlane,
} from './_runtimeGuard.js';
import { getFirebaseControlPlaneEnvStatus } from './_firebaseControlPlaneEnv.js';
import { buildControlPlaneFirebaseReadReport } from './_firebaseControlPlaneReadDiagnostic.js';
import { getPublicControlPlaneReadModel } from './_controlPlanePublicReadModel.js';

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

function latestIso(values: Array<string | null | undefined>): string | null {
  return values
    .filter((value): value is string => !!value && !Number.isNaN(new Date(value).getTime()))
    .sort()
    .at(-1) || null;
}

function ageMs(value: string | null, now = new Date()): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : Math.max(0, now.getTime() - parsed);
}

function buildFreshness(params: {
  runs: any[];
  sessions: any[];
  fixtureStates: any[];
  reports: any[];
  outcomes: any[];
}) {
  const latestWorkerHeartbeatAt = latestIso(params.runs.map(run => run.heartbeatAt || run.updatedAt));
  const latestSessionUpdatedAt = latestIso(params.sessions.map(session => session.updatedAt || session.startedAt));
  const latestSnapshotAt = latestIso(params.fixtureStates.map(state => state.lastSnapshotAt || state.updatedAt));
  const latestDailyReportAt = latestIso(params.reports.map(report => report.generatedAt || report.date));
  const latestCausalCaseAt = latestIso(params.outcomes.map(outcome => outcome.createdAt));
  const operationalLatest = latestIso([latestWorkerHeartbeatAt, latestSessionUpdatedAt, latestSnapshotAt]);
  const anyData = !!latestIso([operationalLatest, latestDailyReportAt, latestCausalCaseAt]);
  const expectedUpdateSeconds = Math.max(30, Number(params.runs[0]?.pollIntervalSeconds || 90));
  const lagMs = ageMs(operationalLatest);
  const staleReasons: string[] = [];
  let freshnessStatus: 'fresh' | 'slightly_stale' | 'stale' | 'empty' | 'unknown' = 'unknown';

  if (!anyData) {
    freshnessStatus = 'empty';
    staleReasons.push('No persisted worker/session/report data is visible to the control plane.');
  } else if (lagMs === null) {
    freshnessStatus = 'stale';
    staleReasons.push('No recent worker heartbeat, session update, or snapshot is visible.');
  } else if (lagMs <= expectedUpdateSeconds * 1000 * 2) {
    freshnessStatus = 'fresh';
  } else if (lagMs <= expectedUpdateSeconds * 1000 * 6) {
    freshnessStatus = 'slightly_stale';
    staleReasons.push('Latest operational update is delayed beyond the expected polling window.');
  } else {
    freshnessStatus = 'stale';
    staleReasons.push('Latest operational update is old; treat active worker state as stale until refreshed.');
  }

  return {
    latestWorkerHeartbeatAt,
    latestSessionUpdatedAt,
    latestSnapshotAt,
    latestDailyReportAt,
    latestCausalCaseAt,
    freshnessStatus,
    staleReasons,
    nextExpectedUpdate: operationalLatest ? new Date(new Date(operationalLatest).getTime() + expectedUpdateSeconds * 1000).toISOString() : null,
    lagMs,
    limitations: [
      'Freshness describes control-plane visibility only; it is not a prediction or accuracy signal.',
      'No active worker is not a failure by itself.',
      'Vercel observes persisted state and does not run worker loops.',
    ],
  };
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

function commonRuntimeBlock() {
  return {
    runtime: {
      environment: detectRuntimeEnvironment(),
      readOnlyControlPlane: isReadOnlyControlPlane(),
      persistentWorkerAllowed: isPersistentWorkerAllowed(),
    },
    readOnly: isReadOnlyControlPlane(),
    commandGuard: {
      startWorker: explainRuntimeGuardDecision('start_worker'),
      readStatus: explainRuntimeGuardDecision('read_status'),
      recoverySweep: explainRuntimeGuardDecision('recovery_sweep'),
      postMatchSweeper: explainRuntimeGuardDecision('post_match_sweeper'),
    },
  };
}

/** B67: build the status read model from sanitized controlPlanePublicSummaries. */
function buildStatusFromSanitized(publicModel: any, firebaseEnv: any) {
  const s = publicModel.summaries || {};
  const ws = s.latestWorkerStatus || {};
  const sessionList = Array.isArray(s.latestLiveSessions?.sessions) ? s.latestLiveSessions.sessions : [];
  const leaseList = Array.isArray(s.latestLeases?.leases) ? s.latestLeases.leases : [];
  const causalList = Array.isArray(s.latestCausalCases?.cases) ? s.latestCausalCases.cases : [];
  const recovery = s.latestRecoveryStatus || {};
  const fresh = s.freshness || {};

  const runs = ws.workerRunId ? [{
    id: ws.workerRunId,
    status: ws.status,
    mode: ws.mode,
    startedAt: ws.startedAt,
    stoppedAt: ws.stoppedAt,
    heartbeatAt: ws.heartbeatAt,
    snapshotsCaptured: ws.snapshotsCaptured ?? 0,
    rechecksTriggered: ws.rechecksTriggered ?? 0,
    postMatchResolved: ws.postMatchResolved ?? 0,
    fixtureIds: [],
    warnings: [],
    limitations: ws.limitations ?? [],
  }] : [];

  const sessions = sessionList.map((x: any) => ({
    id: x.sessionId,
    status: x.status,
    fixtureIds: new Array(x.fixtureCount ?? 0).fill(''),
    snapshotsCaptured: x.snapshotsCaptured ?? 0,
    liveRechecks: x.rechecks ?? 0,
    limitations: x.limitations ?? [],
  }));

  const leases = leaseList.map((x: any) => ({
    fixtureId: x.fixtureId,
    sessionId: x.sessionId,
    status: x.status,
    acquiredAt: x.acquiredAt,
    heartbeatAt: x.heartbeatAt,
    leaseExpiresAt: x.leaseExpiresAt,
    limitations: x.limitations ?? [],
  }));

  const freshnessStatus = fresh.freshnessStatus || ws.freshnessStatus || 'unknown';
  const freshness = {
    latestWorkerHeartbeatAt: fresh.latestWorkerHeartbeatAt ?? ws.heartbeatAt ?? null,
    latestSessionUpdatedAt: null,
    latestSnapshotAt: null,
    latestDailyReportAt: fresh.latestDailyReportAt ?? null,
    latestCausalCaseAt: fresh.latestCausalCaseAt ?? null,
    freshnessStatus,
    staleReasons: [],
    nextExpectedUpdate: null,
    lagMs: fresh.lagMs ?? null,
    limitations: [
      'Freshness derived from sanitized public control-plane summary.',
      'Vercel observes persisted sanitized state and does not run worker loops.',
    ],
  };

  return {
    generatedAt: new Date().toISOString(),
    source: 'vercel_control_plane_sanitized_summary',
    ...commonRuntimeBlock(),
    firebaseEnv,
    firebaseReadDiagnostic: {
      firebaseEnvValid: true,
      firebaseInitialized: true,
      permissionDenied: false,
      freshnessStatus: 'readable',
      controlPlaneDataMode: publicModel.dataMode,
      publicExposure: publicModel.publicExposure,
      publicReadModelEnabled: publicModel.publicReadModelEnabled,
      publicSummaryReadable: publicModel.publicSummaryReadable,
      rawFallbackEnabled: publicModel.rawFallbackEnabled,
      rawCollectionsReadable: false,
      rawPublicExposureWarning: null,
      missingPublicSummary: false,
      permissionDeniedPublicSummary: false,
      sanitizedSnapshotFreshness: publicModel.sanitizedSnapshotFreshness,
      sanitizedSnapshotGeneratedAt: publicModel.sanitizedSnapshotGeneratedAt,
      emptyCollections: [],
      lastErrorSafe: null,
      limitations: [],
    },
    controlPlaneDataState: freshnessStatus,
    active: null,
    workerRuns: runs,
    runs,
    sessions,
    leases,
    fixtureStates: [],
    recoveryReports: recovery.generatedAt ? [recovery] : [],
    postMatchOutcomes: causalList,
    freshness,
    latestDailyReport: (s.latestDailyReport && Object.keys(s.latestDailyReport).length > 0) ? s.latestDailyReport : null,
    latestCausalCases: causalList,
    latestRecoveryReport: recovery.generatedAt ? recovery : null,
    sessionsRunning: sessions.filter((x: any) => x.status === 'running').length,
    fixturesActive: leaseList.filter((x: any) => x.status === 'active').length,
    orphanSessions: recovery.orphanedSessionsFound ?? 0,
    completedFixtures: causalList.filter((x: any) => x.evaluable).length,
    postMatchPending: 0,
    limitations: [
      'Sanitized public read model (minimal exposure); raw collections are private.',
      'No odds, Telegram, auto-bet, stake, or enforce changes.',
    ],
  };
}

/** B67: honest empty model when sanitized summary not yet published (not a failure). */
function emptySanitizedStatus(firebaseEnv: any, firebaseReadDiagnostic: any, dataState: string, publicModel: any) {
  return {
    generatedAt: new Date().toISOString(),
    source: 'vercel_control_plane_sanitized_summary',
    ...commonRuntimeBlock(),
    firebaseEnv,
    firebaseReadDiagnostic: {
      ...firebaseReadDiagnostic,
      controlPlaneDataMode: publicModel?.dataMode ?? 'missing_public_summary',
      publicExposure: publicModel?.publicExposure ?? 'minimal',
      publicSummaryReadable: publicModel?.publicSummaryReadable ?? false,
      rawFallbackEnabled: publicModel?.rawFallbackEnabled ?? false,
      missingPublicSummary: publicModel?.missingPublicSummary ?? true,
    },
    controlPlaneDataState: dataState,
    active: null,
    workerRuns: [],
    runs: [],
    sessions: [],
    leases: [],
    fixtureStates: [],
    recoveryReports: [],
    postMatchOutcomes: [],
    freshness: {
      latestWorkerHeartbeatAt: null, latestSessionUpdatedAt: null, latestSnapshotAt: null,
      latestDailyReportAt: null, latestCausalCaseAt: null,
      freshnessStatus: 'empty', staleReasons: ['Sanitized public summary not published yet.'],
      nextExpectedUpdate: null, lagMs: null,
      limitations: ['Empty sanitized model is not a failure; the worker has not published a snapshot yet.'],
    },
    latestDailyReport: null,
    latestCausalCases: [],
    latestRecoveryReport: null,
    sessionsRunning: 0,
    fixturesActive: 0,
    orphanSessions: 0,
    completedFixtures: 0,
    postMatchPending: 0,
    limitations: [
      'Sanitized public summary not published yet (missing_public_summary is not a failure).',
      'Raw control-plane collections are private; enable ENABLE_RAW_CONTROL_PLANE_READ_FALLBACK only for transitional debugging.',
    ],
  };
}

export async function getControlPlaneStatusReadModel() {
  const firebaseEnv = getFirebaseControlPlaneEnvStatus();

  // ── B67: sanitized-first. Prefer controlPlanePublicSummaries; raw is fallback. ──
  const publicModel = await getPublicControlPlaneReadModel().catch(() => null);
  const rawFallbackEnabled = String(process.env.ENABLE_RAW_CONTROL_PLANE_READ_FALLBACK ?? 'false') === 'true';
  if (publicModel && publicModel.publicSummaryReadable && publicModel.dataMode === 'sanitized_read_model') {
    return buildStatusFromSanitized(publicModel, firebaseEnv);
  }
  if (!rawFallbackEnabled) {
    // No raw fallback in production: return an honest, non-failure empty model.
    const firebaseReadDiagnostic = await buildControlPlaneFirebaseReadReport();
    const dataState = firebaseEnv.requiredMissing.length > 0
      ? 'missing_firebase_env'
      : publicModel?.permissionDeniedPublicSummary
        ? 'firebase_permission_denied'
        : 'missing_public_summary';
    return emptySanitizedStatus(firebaseEnv, firebaseReadDiagnostic, dataState, publicModel);
  }
  // Raw fallback (transitional, flag-gated) — original behavior below.

  const [runs, sessions, leases, recoveryReports, outcomes, reports, fixtureStates] = await Promise.all([
    listCollection('espnLiveFirstWorkerRuns', 'startedAt', 20),
    listCollection('liveMonitoringSessions', 'startedAt', 50),
    listCollection('espnLiveFirstFixtureLeases', 'heartbeatAt', 200),
    listCollection('espnLiveFirstRecoveryReports', 'generatedAt', 10),
    listCollection('liveFirstPostMatchOutcomes', 'createdAt', 50),
    listCollection('dailyValidationReports', 'generatedAt', 5),
    listCollection('liveMonitoringFixtureStates', 'updatedAt', 200),
  ]);
  const limitations = [runs, sessions, leases, recoveryReports, outcomes, reports, fixtureStates]
    .map(result => result.limitation)
    .filter(Boolean) as string[];
  const activeLeases = leases.items.filter((lease: any) => lease.status === 'active');
  const completedOutcomes = outcomes.items.filter((outcome: any) => outcome.evaluable);
  const freshness = buildFreshness({
    runs: runs.items,
    sessions: sessions.items,
    fixtureStates: fixtureStates.items,
    reports: reports.items,
    outcomes: outcomes.items,
  });
  const firebaseReadDiagnostic = await buildControlPlaneFirebaseReadReport();
  const missingEnv = firebaseEnv.requiredMissing.length > 0;
  const emptyFirestore = !missingEnv && firebaseReadDiagnostic.freshnessStatus === 'empty_firestore';

  return {
    generatedAt: new Date().toISOString(),
    source: 'vercel_control_plane_firestore_rest',
    runtime: {
      environment: detectRuntimeEnvironment(),
      readOnlyControlPlane: isReadOnlyControlPlane(),
      persistentWorkerAllowed: isPersistentWorkerAllowed(),
    },
    readOnly: isReadOnlyControlPlane(),
    firebaseEnv,
    firebaseReadDiagnostic,
    controlPlaneDataState: missingEnv
      ? 'missing_firebase_env'
      : firebaseReadDiagnostic.permissionDenied
        ? 'firebase_permission_denied'
        : emptyFirestore
          ? 'empty_firestore'
          : freshness.freshnessStatus,
    active: null,
    workerRuns: runs.items,
    runs: runs.items,
    sessions: sessions.items,
    leases: leases.items,
    fixtureStates: fixtureStates.items,
    recoveryReports: recoveryReports.items,
    postMatchOutcomes: outcomes.items,
    freshness,
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
      ...(missingEnv ? ['missing_firebase_env'] : []),
      ...(firebaseReadDiagnostic.permissionDenied ? ['firebase_permission_denied'] : []),
      ...(emptyFirestore ? ['empty_firestore'] : []),
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
    firebaseEnv: status.firebaseEnv,
    firebaseReadDiagnostic: status.firebaseReadDiagnostic,
    controlPlaneDataState: status.controlPlaneDataState,
    freshness: status.freshness,
    controlPlaneFreshnessStatus: status.freshness.freshnessStatus,
    controlPlaneLagMs: status.freshness.lagMs,
    latestWorkerRunVisibleFromControlPlane: status.workerRuns.length > 0,
    latestDailyReportVisibleFromControlPlane: !!status.latestDailyReport,
    latestCausalCasesVisibleFromControlPlane: status.latestCausalCases.length > 0,
    limitations: status.limitations,
    nextActions: status.readOnly
      ? ['Use Vercel as UI/control plane.', 'Run ESPN Live-First worker via local or dedicated CLI runtime.']
      : ['Verify runtime flags before starting worker commands.'],
  };
}
