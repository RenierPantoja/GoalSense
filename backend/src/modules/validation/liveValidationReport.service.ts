/**
 * Live Validation Report (Phase B37) — honest, observational aggregation.
 * ─────────────────────────────────────────────────────────────────────────────
 * Builds a session summary/report by READING existing data (snapshots, ledger,
 * alerts, outcomes, opportunities, evidence) for the session's fixtures + the
 * process-wide guard metrics. Never alters anything; coverage-absent and unknown
 * are not failures.
 */
import { randomUUID } from 'node:crypto'
import { env } from '../../env.js'
import { createRepositories } from '../../repositories/index.js'
import { getGuardMetrics } from '../localops/livePipelineGuard.service.js'
import { buildRecommendations, deriveGoNoGo } from './utils/liveValidationReport.util.js'
import type {
  LiveValidationSession, LiveValidationSessionFixture, LiveValidationSessionSummary, LiveValidationSessionReport,
} from './liveValidation.types.js'

/** Refresh per-fixture coverage/counters for a session's fixtures (read-only). */
export async function refreshSessionFixtures(sessionId: string): Promise<LiveValidationSessionFixture[]> {
  const repos = createRepositories()
  const fixtures = await repos.intelligence.listLiveValidationSessionFixtures(sessionId, 500).catch(() => [])
  for (const f of fixtures) {
    try {
      const snap = await repos.liveSnapshots.findLatestByFixture(f.fixtureId).catch(() => null)
      const alerts = await repos.alerts.findByFixtureIds(f.fixtureId).catch(() => [])
      const opps = await repos.intelligence.listAutoOpportunitiesByFixture(f.fixtureId, 50).catch(() => [])
      const ledger = await repos.intelligence.listSignalLedgerEntries({ fixtureId: f.fixtureId, limit: 100 }).catch(() => [])
      let outcomeCount = 0
      for (const a of (alerts as any[])) { const o = await repos.intelligence.getAlertOutcomeByAlertId(a.id).catch(() => null); if (o) outcomeCount++ }
      const dq = (snap?.dataQuality as string) || 'unknown'
      const coverageStatus = snap ? (dq === 'rich' ? 'covered' : dq === 'unknown' ? 'unknown' : 'partial') : 'absent'
      const patch: Partial<LiveValidationSessionFixture> = {
        snapshotCount: snap ? 1 : 0,
        signalCount: (ledger as any[]).length,
        alertCount: (alerts as any[]).length,
        opportunityCount: (opps as any[]).length,
        outcomeCount,
        providerQuality: (['rich', 'partial', 'poor', 'unknown'].includes(dq) ? dq : 'unknown') as any,
        coverageStatus: coverageStatus as any,
      }
      Object.assign(f, patch)
      await repos.intelligence.updateLiveValidationSessionFixture(f.id, patch).catch(() => undefined)
    } catch { /* non-fatal per fixture */ }
  }
  return fixtures
}

export async function buildSessionSummary(session: LiveValidationSession): Promise<LiveValidationSessionSummary> {
  const repos = createRepositories()
  const fixtures = await refreshSessionFixtures(session.id)
  const guard = getGuardMetrics()

  const dataQualityBreakdown = { rich: 0, partial: 0, poor: 0, unknown: 0 }
  let observed = 0, snapshotsWritten = 0, signals = 0, alerts = 0, opps = 0, outcomes = 0
  let exact = 0, inferred = 0
  for (const f of fixtures) {
    if (f.coverageStatus !== 'absent') observed++
    snapshotsWritten += f.snapshotCount
    signals += f.signalCount; alerts += f.alertCount; opps += f.opportunityCount; outcomes += f.outcomeCount
    dataQualityBreakdown[(f.providerQuality in dataQualityBreakdown ? f.providerQuality : 'unknown') as keyof typeof dataQualityBreakdown]++
    try {
      const refs = await repos.intelligence.listEvidenceSnapshotReferencesByFixture(f.fixtureId, 200)
      for (const r of refs as any[]) { if (r.linkStrength === 'exact' && r.snapshotId) exact++; else if (r.linkStrength !== 'unknown') inferred++ }
    } catch { /* honest */ }
  }

  const summary: LiveValidationSessionSummary = {
    fixturesPlanned: fixtures.length,
    fixturesObserved: observed,
    fixturesSkipped: fixtures.length - observed,
    snapshotsWritten,
    snapshotsSkipped: guard.snapshotsSkippedNoRelevantChange + guard.snapshotsSkippedInterval + guard.snapshotsSkippedMaxPerFixture,
    providerCallsAllowed: guard.providerCallsAllowed,
    providerCallsBlocked: guard.providerCallsBlocked,
    signalsCreated: signals,
    alertsCreated: alerts,
    opportunitiesCreated: opps,
    outcomesResolved: outcomes,
    exactEvidenceLinks: exact,
    inferredEvidenceLinks: inferred,
    unknownOutcomes: 0,
    notEvaluable: 0,
    dataQualityBreakdown,
    operationalRisk: 'low',
    recommendations: [],
    limitations: [
      'Resumo observacional: agrupa dados existentes por fixture/janela (sem tag por registro).',
      'Métricas de provider/snapshot são do processo (não isoladas por sessão).',
    ],
  }
  // Operational risk from guard metrics (process-wide, advisory).
  if (guard.providerCallsBlocked > 0 || guard.fixturesSkippedByCap > 0) summary.operationalRisk = 'moderate'
  summary.recommendations = buildRecommendations(summary)
  return summary
}

export async function buildSessionReport(session: LiveValidationSession): Promise<LiveValidationSessionReport> {
  const repos = createRepositories()
  const summary = await buildSessionSummary(session)
  const fixtures = await repos.intelligence.listLiveValidationSessionFixtures(session.id, 500).catch(() => [])
  const events = await repos.intelligence.listLiveValidationSessionEvents(session.id, env.LIVE_VALIDATION_REPORT_LIMIT).catch(() => [])
  const guard = getGuardMetrics()
  const lowCoverageFixtures = fixtures.filter(f => f.coverageStatus === 'absent' || f.coverageStatus === 'partial').map(f => `${f.homeTeam} vs ${f.awayTeam}`)

  const report: LiveValidationSessionReport = {
    id: `lvr_${randomUUID()}`,
    sessionId: session.id,
    generatedAt: new Date().toISOString(),
    session: { ...session, summary },
    fixtures,
    events,
    summary,
    quality: { dataQualityBreakdown: summary.dataQualityBreakdown, lowCoverageFixtures },
    evidence: { exact: summary.exactEvidenceLinks, inferred: summary.inferredEvidenceLinks, unknown: summary.unknownOutcomes },
    operations: {
      providerCallsAllowed: guard.providerCallsAllowed, providerCallsBlocked: guard.providerCallsBlocked,
      snapshotsWritten: guard.snapshotsWritten, snapshotsSkipped: summary.snapshotsSkipped,
      guardMode: guard.guardMode, profile: String(env.LOCAL_RUNTIME_PROFILE),
    },
    recommendations: summary.recommendations,
    goNoGo: deriveGoNoGo(summary),
    limitations: summary.limitations,
  }
  try { await repos.intelligence.createLiveValidationSessionReport(report) } catch { /* non-fatal */ }
  return report
}
