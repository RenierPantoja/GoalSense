/**
 * Control Plane Public Read Model — B66
 * ─────────────────────────────────────────────────────────────────────────────
 * Builds SANITIZED, allowlisted summaries from the raw operational read model and
 * publishes them to `controlPlanePublicSummaries` via the Admin SDK. The hosted
 * Vercel control plane reads these instead of raw collections.
 *
 * Safety:
 *   - Only allowlisted fields are emitted (publicControlPlaneAllowlist).
 *   - A forbidden-field scan runs before publish; if any leak is detected the
 *     offending doc is dropped (never published) and reported.
 *   - Publishing is throttled (CONTROL_PLANE_PUBLIC_SNAPSHOT_MIN_INTERVAL_SECONDS).
 *   - Client writes to this collection remain denied by Firestore Rules; only the
 *     Admin SDK (worker/backend) writes here.
 */
import { env } from '../../env.js'
import { createRepositories } from '../../repositories/index.js'
import { getLatestWorkerStatusReadModel } from '../runtime/workerControlPlaneReadModel.service.js'
import {
  WORKER_STATUS_ALLOWLIST, SESSION_ALLOWLIST, LEASE_ALLOWLIST,
  DAILY_REPORT_ALLOWLIST, CAUSAL_CASE_ALLOWLIST,
  sanitizeByAllowlist, findForbiddenFields,
} from './publicControlPlaneAllowlist.js'
import type {
  ControlPlanePublicSummaryDoc, ControlPlanePublicSnapshotResult,
} from './controlPlanePublic.types.js'

const PUBLIC_MODEL_VERSION = 'b66.1'

let lastPublishedAtMs = 0

// ── Builders (sanitized) ─────────────────────────────────────────────────────

export async function buildPublicWorkerStatusSummary() {
  const status = await getLatestWorkerStatusReadModel()
  const latest = status.workerRuns[0]
  const data = latest
    ? sanitizeByAllowlist({
        workerRunId: latest.id,
        status: latest.status,
        mode: latest.mode,
        startedAt: latest.startedAt,
        stoppedAt: latest.stoppedAt,
        heartbeatAt: latest.heartbeatAt,
        fixtureCount: latest.fixtureIds?.length ?? 0,
        sessionCount: status.sessions.length,
        snapshotsCaptured: latest.snapshotsCaptured ?? 0,
        rechecksTriggered: latest.rechecksTriggered ?? 0,
        postMatchResolved: latest.postMatchResolved ?? 0,
        warningsCount: (latest.warnings?.length ?? 0),
        limitations: latest.limitations ?? [],
        freshnessStatus: status.freshness.freshnessStatus,
      }, WORKER_STATUS_ALLOWLIST)
    : { freshnessStatus: status.freshness.freshnessStatus }
  return { data, freshnessStatus: status.freshness.freshnessStatus }
}

export async function buildPublicLiveSessionsSummary() {
  const status = await getLatestWorkerStatusReadModel()
  const sessions = status.sessions.slice(0, 50).map((s: any) => sanitizeByAllowlist({
    sessionId: s.id,
    status: s.status,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    fixtureCount: s.fixtureIds?.length ?? 0,
    snapshotsCaptured: s.snapshotsCaptured ?? 0,
    governanceEvaluations: s.governanceEvaluations ?? 0,
    rechecks: s.liveRechecks ?? 0,
    completedFixtures: s.completedFixtures ?? 0,
    limitations: s.limitations ?? [],
  }, SESSION_ALLOWLIST))
  return { sessions }
}

export async function buildPublicLeasesSummary() {
  const status = await getLatestWorkerStatusReadModel()
  const leases = status.leases.slice(0, 200).map((l: any) => sanitizeByAllowlist({
    fixtureId: l.fixtureId,
    sessionId: l.sessionId,
    status: l.status,
    acquiredAt: l.acquiredAt,
    heartbeatAt: l.heartbeatAt,
    leaseExpiresAt: l.leaseExpiresAt,
    limitations: l.limitations ?? [],
  }, LEASE_ALLOWLIST))
  return { leases }
}

export async function buildPublicDailyReportSummary() {
  const status = await getLatestWorkerStatusReadModel()
  const report: any = status.latestDailyReport
  if (!report) return { data: null }
  const data = sanitizeByAllowlist({
    date: report.date,
    backendHealth: report.backendHealth,
    goNoGoStatus: report.goNoGoStatus,
    liveFirstReal: report.liveFirstReal,
    espnLiveFixturesAnalyzed: report.espnLiveFixturesAnalyzed ?? report.fixturesAnalyzed,
    snapshotsCaptured: report.realSnapshotsCaptured ?? report.snapshotsCaptured,
    liveFirstEvaluableCases: report.liveFirstEvaluableCases,
    freshness: report.controlPlaneFreshnessStatus ?? status.freshness.freshnessStatus,
    limitations: report.limitations ?? [],
    generatedAt: report.generatedAt,
  }, DAILY_REPORT_ALLOWLIST)
  return { data }
}

export async function buildPublicCausalCasesSummary() {
  const status = await getLatestWorkerStatusReadModel()
  const cases = status.latestCausalCases.slice(0, 20).map((c: any) => sanitizeByAllowlist({
    caseId: c.id ?? `${c.fixtureId}_${c.sessionId ?? ''}`,
    fixtureId: c.fixtureId,
    classification: c.outcome ?? c.classification,
    evaluable: c.evaluable,
    linkStrength: c.linkStrength ?? c.governanceAccuracy ? 'linked' : 'unknown',
    dataMode: c.dataMode ?? 'espn_live_first',
    limitations: c.limitations ?? [],
    createdAt: c.createdAt,
  }, CAUSAL_CASE_ALLOWLIST))
  return { cases }
}

// ── B69: sanitized public signal-quality summary ────────────────────────────

export async function buildPublicSignalQualitySummary() {
  const repos = createRepositories()
  const review: any = await repos.intelligence.getLatestLiveFirstSignalQualityReview().catch(() => null)
  if (!review) {
    return {
      summary: { observeOnly: true, dataMode: 'sanitized_read_model', available: false, sampleSize: 0, limitations: ['No signal quality review published yet (not a failure).'] },
      casesPreview: [] as any[],
    }
  }
  const topUsefulSignals = (review.topUsefulSignals || []).slice(0, 5).map((s: any) => ({ signalKind: String(s.signalKind), count: Number(s.count) || 0 }))
  const topNoisySignals = (review.topNoisySignals || []).slice(0, 5).map((s: any) => ({ signalKind: String(s.signalKind), count: Number(s.count) || 0 }))
  const summary = {
    observeOnly: true,
    dataMode: 'sanitized_read_model',
    available: true,
    generatedAt: review.generatedAt,
    sampleSize: review.sampleSize ?? 0,
    signalsReviewed: review.signalsReviewed ?? 0,
    reliableObserve: review.reliableObserve ?? 0,
    usefulButLimited: review.usefulButLimited ?? 0,
    noisyMonitorOnly: review.noisyMonitorOnly ?? 0,
    insufficientData: review.insufficientData ?? 0,
    misleadingCandidate: review.misleadingCandidate ?? 0,
    pendingMoreSample: review.pendingMoreSample ?? 0,
    topUsefulSignals,
    topNoisySignals,
    governanceFeedbackSummary: (review.governanceQualityFeedback || []).slice(0, 5),
    momentumNoiseFindings: (review.momentumNoiseFindings || []).slice(0, 5),
    recommendedHumanReviewCount: (review.recommendations || []).length,
    limitations: (review.limitations || []).slice(0, 5),
  }
  // Sanitized case preview from persisted cases (allowlisted, no raw payloads).
  const cases: any[] = await repos.intelligence.listLiveFirstSignalQualityCases(10).catch(() => [])
  const casesPreview = cases.slice(0, 10).map(c => ({
    caseId: String(c.id),
    fixtureId: String(c.fixtureId),
    signalKind: String(c.signalKind),
    evidenceStrength: String(c.evidenceStrength),
    noiseRisk: String(c.noiseRisk),
    outcomeAlignment: String(c.outcomeAlignment),
    qualityGrade: String(c.qualityGrade),
    matchMinute: c.matchMinute ?? null,
    limitations: (c.limitations || []).slice(0, 3),
    createdAt: c.createdAt,
  }))
  return { summary, casesPreview }
}

// ── Snapshot assembly + publish ──────────────────────────────────────────────
export async function buildPublicControlPlaneSnapshot(): Promise<ControlPlanePublicSummaryDoc[]> {
  const status = await getLatestWorkerStatusReadModel()
  const generatedAt = new Date().toISOString()
  const mk = (id: string, data: Record<string, any>): ControlPlanePublicSummaryDoc => ({
    id, data, generatedAt, publicModelVersion: PUBLIC_MODEL_VERSION, limitations: [
      'Sanitized public summary; only allowlisted operational fields are included.',
    ],
  })

  const [workerStatus, sessions, leases, daily, causal, signalQuality] = await Promise.all([
    buildPublicWorkerStatusSummary(),
    buildPublicLiveSessionsSummary(),
    buildPublicLeasesSummary(),
    buildPublicDailyReportSummary(),
    buildPublicCausalCasesSummary(),
    buildPublicSignalQualitySummary(),
  ])

  const recovery = status.latestRecoveryReport
    ? {
        orphanedSessionsFound: status.latestRecoveryReport.orphanedSessionsFound ?? 0,
        recoveredSessions: (status.latestRecoveryReport.recoveredSessions?.length ?? 0),
        generatedAt: status.latestRecoveryReport.generatedAt,
      }
    : { orphanedSessionsFound: 0, recoveredSessions: 0 }

  return [
    mk('latestWorkerStatus', workerStatus.data),
    mk('latestLiveSessions', { sessions: sessions.sessions, count: sessions.sessions.length }),
    mk('latestLeases', { leases: leases.leases, activeCount: leases.leases.filter((l: any) => l.status === 'active').length }),
    mk('latestDailyReport', daily.data ?? {}),
    mk('latestCausalCases', { cases: causal.cases, evaluableCount: causal.cases.filter((c: any) => c.evaluable).length }),
    mk('latestSignalQualitySummary', signalQuality.summary),
    mk('latestSignalQualityCasesPreview', { cases: signalQuality.casesPreview, count: signalQuality.casesPreview.length }),
    mk('latestRecoveryStatus', recovery),
    mk('freshness', {
      freshnessStatus: status.freshness.freshnessStatus,
      latestWorkerHeartbeatAt: status.freshness.latestWorkerHeartbeatAt,
      latestDailyReportAt: status.freshness.latestDailyReportAt,
      latestCausalCaseAt: status.freshness.latestCausalCaseAt,
      lagMs: status.freshness.lagMs,
      publicModelVersion: PUBLIC_MODEL_VERSION,
    }),
  ]
}

export async function publishPublicControlPlaneSnapshot(opts: { force?: boolean } = {}): Promise<ControlPlanePublicSnapshotResult> {
  const generatedAt = new Date().toISOString()
  const enabled = String(process.env.ENABLE_PUBLIC_CONTROL_PLANE_READ_MODEL ?? env.ENABLE_PUBLIC_CONTROL_PLANE_READ_MODEL ?? 'true') === 'true'
  if (!enabled) {
    return { published: false, reason: 'public_read_model_disabled', publishedDocs: [], generatedAt, forbiddenFieldsFound: [] }
  }

  const minIntervalMs = Math.max(0, Number(process.env.CONTROL_PLANE_PUBLIC_SNAPSHOT_MIN_INTERVAL_SECONDS ?? env.CONTROL_PLANE_PUBLIC_SNAPSHOT_MIN_INTERVAL_SECONDS ?? 30)) * 1000
  const sinceLast = Date.now() - lastPublishedAtMs
  if (!opts.force && lastPublishedAtMs > 0 && sinceLast < minIntervalMs) {
    return {
      published: false,
      reason: 'throttled',
      publishedDocs: [],
      throttledUntil: new Date(lastPublishedAtMs + minIntervalMs).toISOString(),
      generatedAt,
      forbiddenFieldsFound: [],
    }
  }

  const docs = await buildPublicControlPlaneSnapshot()

  // Defense-in-depth: scan every doc for forbidden fields/values before publish.
  const forbiddenFieldsFound: string[] = []
  const safeDocs: ControlPlanePublicSummaryDoc[] = []
  for (const doc of docs) {
    const leaks = findForbiddenFields(doc.data, doc.id)
    if (leaks.length > 0) {
      forbiddenFieldsFound.push(...leaks)
      continue // drop the offending doc entirely; never publish a leak
    }
    safeDocs.push(doc)
  }

  const repos = createRepositories()
  const publishedDocs: string[] = []
  for (const doc of safeDocs) {
    await repos.intelligence.saveControlPlanePublicSummary(doc).catch(() => {})
    publishedDocs.push(doc.id)
  }

  lastPublishedAtMs = Date.now()
  return {
    published: publishedDocs.length > 0,
    reason: publishedDocs.length > 0 ? 'published' : 'nothing_safe_to_publish',
    publishedDocs,
    generatedAt,
    forbiddenFieldsFound,
  }
}

/** Reset throttle (test helper). */
export function __resetPublicSnapshotThrottle(): void {
  lastPublishedAtMs = 0
}
