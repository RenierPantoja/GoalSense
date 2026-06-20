/**
 * Firebase Intelligence Repository (Phase B12)
 * ─────────────────────────────────────────────────────────────────────────────
 * Firestore implementation of the Football Intelligence Memory.
 * Collections:
 *   signalLedger/{ledgerId}            (deterministic: led_${alertId})
 *   alertOutcomes/{outcomeId}          (deterministic: out_${alertId})
 *   signalFailures/{failureId}         (deterministic: fail_${alertId})
 *   missedOpportunities/{id}           (deterministic per fixture+pattern+event)
 *   learningEvents/{id}                (time-ordered)
 *
 * Same conventions as the other Firebase repos: deterministic ids for
 * idempotency, merge writes, ISO timestamps, single-equality queries + in-memory
 * sort to avoid mandatory composite indexes at current (single-user) volume.
 */
import { getFirestore } from '../../firebase/admin.js'
import type { IntelligenceRepository, Json } from '../contracts.js'
import type {
  SignalLedgerEntry, AlertOutcomeRecord, SignalFailureAnalysis,
  MissedOpportunityRecord, LearningEvent, IntelligenceOverview, AlertResult,
} from '../../modules/intelligence/contracts/intelligence.types.js'
import type {
  LearningAggregationRun, PatternLearningProfile, CompetitionLearningProfile,
  TeamLearningProfile, SignalContextStats, LearningRecommendation,
} from '../../modules/intelligence/contracts/learning.types.js'
import type {
  BacktestRun, ReplayRun, PersistedBacktestSignalResult, BacktestReplayEvidenceReprocessRun,
} from '../../modules/intelligence/backtest/backtest.types.js'
import type {
  AutoEngineRun, AutoOpportunity, AutoOpportunityAction, AutoOpportunityUserState,
  AutoOpportunityPromotionPlan, ManualPromotedAlertLink,
  PromotedAlertOutcomeLink, AutoOpportunityOutcomeSummary,
} from '../../modules/intelligence/autoEngine/autoEngine.types.js'
import type {
  AutoEngineLearningRun, AutoEngineLearningProfile, AutoOpportunityTypeProfile,
  AutoEngineLearningRecommendation,
} from '../../modules/intelligence/autoEngine/autoEngineLearning.types.js'
import type {
  AutoAlertPolicy, AutoAlertPolicyEvaluation,
} from '../../modules/intelligence/autoEngine/autoAlertPolicy.types.js'
import type { AdminAuditEntry } from '../../modules/audit/adminAudit.types.js'
import type { SnapshotRetentionRun, LocalOpsMetricsSnapshot } from '../../modules/localops/snapshotLifecycle.types.js'
import type { EvidenceSnapshotReference } from '../../modules/intelligence/evidence/evidenceLineage.types.js'
import type {
  LiveValidationSession, LiveValidationSessionFixture, LiveValidationSessionEvent, LiveValidationSessionReport,
} from '../../modules/validation/liveValidation.types.js'
import type {
  LiveValidationRecordLink, LiveValidationSessionMetricCounter, DynamicFixtureAttachRun,
} from '../../modules/validation/liveValidationIndex.types.js'

const LEDGER = 'signalLedger'
const OUTCOMES = 'alertOutcomes'
const FAILURES = 'signalFailures'
const MISSED = 'missedOpportunities'
const LEARNING = 'learningEvents'
const RUNS = 'learningAggregationRuns'
const PATTERN_PROFILES = 'patternLearningProfiles'
const COMPETITION_PROFILES = 'competitionLearningProfiles'
const TEAM_PROFILES = 'teamLearningProfiles'
const CONTEXT_STATS = 'signalContextStats'
const RECOMMENDATIONS = 'learningRecommendations'
const BACKTEST_RUNS = 'backtestRuns'
const BACKTEST_RESULTS = 'backtestSignalResults'
const REPLAY_RUNS = 'replayRuns'
const AUTO_RUNS = 'autoEngineRuns'
const AUTO_OPPS = 'autoOpportunities'
const AUTO_ACTIONS = 'autoOpportunityActions'
const AUTO_USER_STATES = 'autoOpportunityUserStates'
const AUTO_PROMOTIONS = 'autoOpportunityPromotionPlans'
const AUTO_PROMOTED_LINKS = 'autoPromotedAlertLinks'
const AUTO_PROMOTED_OUTCOME_LINKS = 'autoPromotedAlertOutcomeLinks'
const AUTO_OUTCOME_SUMMARIES = 'autoOpportunityOutcomeSummaries'
const AUTO_LEARNING_RUNS = 'autoEngineLearningRuns'
const AUTO_LEARNING_PROFILES = 'autoEngineLearningProfiles'
const AUTO_ALERT_POLICIES = 'autoAlertPolicies'
const AUTO_ALERT_POLICY_EVALS = 'autoAlertPolicyEvaluations'
const ADMIN_AUDIT = 'adminAuditTrail'
const SNAPSHOT_RETENTION_RUNS = 'snapshotRetentionRuns'
const LOCAL_OPS_METRICS = 'localOpsMetrics'
const EVIDENCE_REFS = 'evidenceSnapshotReferences'
const BT_REPLAY_REPROCESS_RUNS = 'backtestReplayEvidenceReprocessRuns'
const LV_SESSIONS = 'liveValidationSessions'
const LV_FIXTURES = 'liveValidationSessionFixtures'
const LV_EVENTS = 'liveValidationSessionEvents'
const LV_REPORTS = 'liveValidationSessionReports'
const LV_RECORD_LINKS = 'liveValidationRecordLinks'
const LV_METRIC_COUNTERS = 'liveValidationSessionMetricCounters'
const LV_ATTACH_RUNS = 'dynamicFixtureAttachRuns'

const READ_CAP = 2000

function docData<T>(doc: any): T {
  return { id: doc.id, ...doc.data() } as T
}
function byCreatedAtDesc(a: any, b: any): number {
  return (b.createdAt || '').localeCompare(a.createdAt || '')
}

export class FirebaseIntelligenceRepository implements IntelligenceRepository {
  // ── Signal Ledger ──────────────────────────────────────────────────────────
  async createSignalLedgerEntry(entry: SignalLedgerEntry): Promise<SignalLedgerEntry> {
    const db = await getFirestore()
    await db.collection(LEDGER).doc(entry.id).set(entry, { merge: true })
    return entry
  }

  async updateSignalLedgerEntry(id: string, patch: Partial<SignalLedgerEntry>): Promise<{ count: number }> {
    const db = await getFirestore()
    const doc = await db.collection(LEDGER).doc(id).get()
    if (!doc.exists) return { count: 0 }
    const clean: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) { if (v !== undefined) clean[k] = v }
    clean.updatedAt = new Date().toISOString()
    await db.collection(LEDGER).doc(id).set(clean, { merge: true })
    return { count: 1 }
  }

  async getSignalLedgerEntryByAlertId(alertId: string): Promise<SignalLedgerEntry | null> {
    const db = await getFirestore()
    // Deterministic id makes this a direct lookup.
    const direct = await db.collection(LEDGER).doc(`led_${alertId}`).get()
    if (direct.exists) return docData<SignalLedgerEntry>(direct)
    const snap = await db.collection(LEDGER).where('alertId', '==', alertId).limit(1).get()
    return snap.empty ? null : docData<SignalLedgerEntry>(snap.docs[0])
  }

  async listSignalLedgerEntries(filters: { patternId?: string; fixtureId?: string; limit?: number }): Promise<SignalLedgerEntry[]> {
    const db = await getFirestore()
    let q: any = db.collection(LEDGER)
    if (filters.patternId) q = q.where('patternId', '==', filters.patternId)
    else if (filters.fixtureId) q = q.where('fixtureId', '==', filters.fixtureId)
    const snap = await q.get()
    const rows = snap.docs.map((d: any) => docData<SignalLedgerEntry>(d)).sort(byCreatedAtDesc)
    return rows.slice(0, filters.limit || 200)
  }

  // ── Alert Outcome ────────────────────────────────────────────────────────────
  async createAlertOutcome(record: AlertOutcomeRecord): Promise<AlertOutcomeRecord> {
    const db = await getFirestore()
    await db.collection(OUTCOMES).doc(record.id).set(record, { merge: true })
    return record
  }

  async updateAlertOutcome(alertId: string, patch: Partial<AlertOutcomeRecord>): Promise<{ count: number }> {
    const db = await getFirestore()
    const id = `out_${alertId}`
    const doc = await db.collection(OUTCOMES).doc(id).get()
    if (!doc.exists) return { count: 0 }
    const clean: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) { if (v !== undefined) clean[k] = v }
    clean.updatedAt = new Date().toISOString()
    await db.collection(OUTCOMES).doc(id).set(clean, { merge: true })
    return { count: 1 }
  }

  async getAlertOutcomeByAlertId(alertId: string): Promise<AlertOutcomeRecord | null> {
    const db = await getFirestore()
    const doc = await db.collection(OUTCOMES).doc(`out_${alertId}`).get()
    return doc.exists ? docData<AlertOutcomeRecord>(doc) : null
  }

  async listAlertOutcomesByPattern(patternId: string, limit?: number): Promise<AlertOutcomeRecord[]> {
    const db = await getFirestore()
    const snap = await db.collection(OUTCOMES).where('patternId', '==', patternId).get()
    const rows = snap.docs.map((d: any) => docData<AlertOutcomeRecord>(d)).sort(byCreatedAtDesc)
    return rows.slice(0, limit || 500)
  }

  // ── Failure Analysis ──────────────────────────────────────────────────────────
  async createFailureAnalysis(analysis: SignalFailureAnalysis): Promise<SignalFailureAnalysis> {
    const db = await getFirestore()
    await db.collection(FAILURES).doc(analysis.id).set(analysis, { merge: true })
    return analysis
  }
  async getFailureAnalysisByAlertId(alertId: string): Promise<SignalFailureAnalysis | null> {
    const db = await getFirestore()
    // Deterministic id from B12 (fail_${alertId}) makes this a direct lookup.
    const direct = await db.collection(FAILURES).doc(`fail_${alertId}`).get()
    if (direct.exists) return docData<SignalFailureAnalysis>(direct)
    const snap = await db.collection(FAILURES).where('alertId', '==', alertId).limit(1).get()
    return snap.empty ? null : docData<SignalFailureAnalysis>(snap.docs[0])
  }
  async listFailureAnalysesByPattern(patternId: string, limit?: number): Promise<SignalFailureAnalysis[]> {
    const db = await getFirestore()
    const snap = await db.collection(FAILURES).where('patternId', '==', patternId).get()
    return snap.docs.map((d: any) => docData<SignalFailureAnalysis>(d)).sort(byCreatedAtDesc).slice(0, limit || 200)
  }

  // ── Missed Opportunity ────────────────────────────────────────────────────────
  async createMissedOpportunity(record: MissedOpportunityRecord): Promise<MissedOpportunityRecord> {
    const db = await getFirestore()
    await db.collection(MISSED).doc(record.id).set(record, { merge: true })
    return record
  }

  // ── Learning Events ────────────────────────────────────────────────────────────
  async createLearningEvent(event: LearningEvent): Promise<LearningEvent> {
    const db = await getFirestore()
    await db.collection(LEARNING).doc(event.id).set(event, { merge: true })
    return event
  }

  async listLearningEventsByPattern(patternId: string, limit?: number): Promise<LearningEvent[]> {
    const db = await getFirestore()
    const snap = await db.collection(LEARNING).where('patternId', '==', patternId).get()
    const rows = snap.docs.map((d: any) => docData<LearningEvent>(d)).sort(byCreatedAtDesc)
    return rows.slice(0, limit || 200)
  }
  async getLearningEventById(id: string): Promise<LearningEvent | null> {
    const db = await getFirestore()
    const doc = await db.collection(LEARNING).doc(id).get()
    return doc.exists ? docData<LearningEvent>(doc) : null
  }

  // ── Overview ────────────────────────────────────────────────────────────────────
  async getOverview(): Promise<IntelligenceOverview> {
    const db = await getFirestore()
    const [ledgerSnap, outcomeSnap, failureSnap, learningSnap, missedSnap] = await Promise.all([
      db.collection(LEDGER).limit(READ_CAP).get(),
      db.collection(OUTCOMES).limit(READ_CAP).get(),
      db.collection(FAILURES).limit(READ_CAP).get(),
      db.collection(LEARNING).limit(READ_CAP).get(),
      db.collection(MISSED).limit(READ_CAP).get(),
    ])
    const outcomeBreakdown: Record<AlertResult, number> = {
      pending: 0, confirmed: 0, confirmed_partial: 0, failed: 0, unknown: 0, expired: 0,
    }
    for (const d of outcomeSnap.docs) {
      const r = (d.data().result || 'unknown') as AlertResult
      if (r in outcomeBreakdown) outcomeBreakdown[r]++
    }
    return {
      ledgerEntries: ledgerSnap.size,
      outcomes: outcomeSnap.size,
      outcomeBreakdown,
      failureAnalyses: failureSnap.size,
      learningEvents: learningSnap.size,
      missedOpportunities: missedSnap.size,
      generatedAt: new Date().toISOString(),
    }
  }

  // ── B13: bulk reads ──────────────────────────────────────────────────────────
  async listAllSignalLedgerEntries(limit?: number): Promise<SignalLedgerEntry[]> {
    const db = await getFirestore()
    const snap = await db.collection(LEDGER).limit(limit || READ_CAP).get()
    return snap.docs.map((d: any) => docData<SignalLedgerEntry>(d))
  }
  async listAllAlertOutcomes(limit?: number): Promise<AlertOutcomeRecord[]> {
    const db = await getFirestore()
    const snap = await db.collection(OUTCOMES).limit(limit || READ_CAP).get()
    return snap.docs.map((d: any) => docData<AlertOutcomeRecord>(d))
  }
  async listAllFailureAnalyses(limit?: number): Promise<SignalFailureAnalysis[]> {
    const db = await getFirestore()
    const snap = await db.collection(FAILURES).limit(limit || READ_CAP).get()
    return snap.docs.map((d: any) => docData<SignalFailureAnalysis>(d))
  }
  async listRecentLearningEvents(limit?: number): Promise<LearningEvent[]> {
    const db = await getFirestore()
    const snap = await db.collection(LEARNING).limit(READ_CAP).get()
    return snap.docs.map((d: any) => docData<LearningEvent>(d)).sort(byCreatedAtDesc).slice(0, limit || 50)
  }

  // ── B13: aggregation runs ────────────────────────────────────────────────────
  async createLearningAggregationRun(run: LearningAggregationRun): Promise<LearningAggregationRun> {
    const db = await getFirestore()
    await db.collection(RUNS).doc(run.id).set(run, { merge: true })
    return run
  }
  async updateLearningAggregationRun(id: string, patch: Partial<LearningAggregationRun>): Promise<{ count: number }> {
    const db = await getFirestore()
    const clean: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) { if (v !== undefined) clean[k] = v }
    await db.collection(RUNS).doc(id).set(clean, { merge: true })
    return { count: 1 }
  }
  async getLatestLearningAggregationRun(): Promise<LearningAggregationRun | null> {
    const db = await getFirestore()
    const snap = await db.collection(RUNS).limit(READ_CAP).get()
    const rows = snap.docs.map((d: any) => docData<LearningAggregationRun>(d))
      .sort((a: any, b: any) => (b.startedAt || '').localeCompare(a.startedAt || ''))
    return rows.length > 0 ? rows[0] : null
  }

  // ── B13: profiles ────────────────────────────────────────────────────────────
  async upsertPatternLearningProfile(profile: PatternLearningProfile): Promise<PatternLearningProfile> {
    const db = await getFirestore()
    await db.collection(PATTERN_PROFILES).doc(profile.id).set(profile, { merge: true })
    return profile
  }
  async getPatternLearningProfile(patternId: string): Promise<PatternLearningProfile | null> {
    const db = await getFirestore()
    const snap = await db.collection(PATTERN_PROFILES).where('scopeKey', '==', patternId).limit(1).get()
    return snap.empty ? null : docData<PatternLearningProfile>(snap.docs[0])
  }
  async listPatternLearningProfiles(limit?: number): Promise<PatternLearningProfile[]> {
    const db = await getFirestore()
    const snap = await db.collection(PATTERN_PROFILES).limit(limit || 500).get()
    return snap.docs.map((d: any) => docData<PatternLearningProfile>(d))
  }
  async upsertCompetitionLearningProfile(profile: CompetitionLearningProfile): Promise<CompetitionLearningProfile> {
    const db = await getFirestore()
    await db.collection(COMPETITION_PROFILES).doc(profile.id).set(profile, { merge: true })
    return profile
  }
  async getCompetitionLearningProfile(key: string): Promise<CompetitionLearningProfile | null> {
    const db = await getFirestore()
    const snap = await db.collection(COMPETITION_PROFILES).where('scopeKey', '==', key).limit(1).get()
    return snap.empty ? null : docData<CompetitionLearningProfile>(snap.docs[0])
  }
  async listCompetitionLearningProfiles(limit?: number): Promise<CompetitionLearningProfile[]> {
    const db = await getFirestore()
    const snap = await db.collection(COMPETITION_PROFILES).limit(limit || 500).get()
    return snap.docs.map((d: any) => docData<CompetitionLearningProfile>(d))
  }
  async upsertTeamLearningProfile(profile: TeamLearningProfile): Promise<TeamLearningProfile> {
    const db = await getFirestore()
    await db.collection(TEAM_PROFILES).doc(profile.id).set(profile, { merge: true })
    return profile
  }
  async getTeamLearningProfile(key: string): Promise<TeamLearningProfile | null> {
    const db = await getFirestore()
    const snap = await db.collection(TEAM_PROFILES).where('scopeKey', '==', key).limit(1).get()
    return snap.empty ? null : docData<TeamLearningProfile>(snap.docs[0])
  }
  async listTeamLearningProfiles(limit?: number): Promise<TeamLearningProfile[]> {
    const db = await getFirestore()
    const snap = await db.collection(TEAM_PROFILES).limit(limit || 500).get()
    return snap.docs.map((d: any) => docData<TeamLearningProfile>(d))
  }
  async upsertSignalContextStats(stats: SignalContextStats): Promise<SignalContextStats> {
    const db = await getFirestore()
    await db.collection(CONTEXT_STATS).doc(stats.id).set(stats, { merge: true })
    return stats
  }
  async listSignalContextStats(limit?: number): Promise<SignalContextStats[]> {
    const db = await getFirestore()
    const snap = await db.collection(CONTEXT_STATS).limit(limit || 1000).get()
    return snap.docs.map((d: any) => docData<SignalContextStats>(d))
  }
  async createLearningRecommendation(rec: LearningRecommendation): Promise<LearningRecommendation> {
    const db = await getFirestore()
    await db.collection(RECOMMENDATIONS).doc(rec.id).set(rec, { merge: true })
    return rec
  }
  async listLearningRecommendations(limit?: number): Promise<LearningRecommendation[]> {
    const db = await getFirestore()
    const snap = await db.collection(RECOMMENDATIONS).limit(READ_CAP).get()
    return snap.docs.map((d: any) => docData<LearningRecommendation>(d)).sort(byCreatedAtDesc).slice(0, limit || 200)
  }

  // ── B14: backtest & replay ───────────────────────────────────────────────────
  async createBacktestRun(run: BacktestRun): Promise<BacktestRun> {
    const db = await getFirestore()
    await db.collection(BACKTEST_RUNS).doc(run.id).set(run, { merge: true })
    return run
  }
  async updateBacktestRun(id: string, patch: Partial<BacktestRun>): Promise<{ count: number }> {
    const db = await getFirestore()
    const clean: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) { if (v !== undefined) clean[k] = v }
    await db.collection(BACKTEST_RUNS).doc(id).set(clean, { merge: true })
    return { count: 1 }
  }
  async getBacktestRun(id: string): Promise<BacktestRun | null> {
    const db = await getFirestore()
    const doc = await db.collection(BACKTEST_RUNS).doc(id).get()
    return doc.exists ? docData<BacktestRun>(doc) : null
  }
  async listBacktestRuns(filters: { patternId?: string; limit?: number }): Promise<BacktestRun[]> {
    const db = await getFirestore()
    let q: any = db.collection(BACKTEST_RUNS)
    if (filters.patternId) q = q.where('patternId', '==', filters.patternId)
    const snap = await q.get()
    return snap.docs.map((d: any) => docData<BacktestRun>(d)).sort(byCreatedAtDesc).slice(0, filters.limit || 100)
  }
  async createBacktestSignalResult(result: PersistedBacktestSignalResult): Promise<PersistedBacktestSignalResult> {
    const db = await getFirestore()
    await db.collection(BACKTEST_RESULTS).doc(result.id).set(result, { merge: true })
    return result
  }
  async listBacktestSignalResults(runId: string, limit?: number): Promise<PersistedBacktestSignalResult[]> {
    const db = await getFirestore()
    const snap = await db.collection(BACKTEST_RESULTS).where('runId', '==', runId).get()
    return snap.docs.map((d: any) => docData<PersistedBacktestSignalResult>(d)).slice(0, limit || 500)
  }
  async updateBacktestSignalResult(id: string, patch: Json): Promise<{ count: number }> {
    const db = await getFirestore()
    const ref = db.collection(BACKTEST_RESULTS).doc(id)
    const doc = await ref.get()
    if (!doc.exists) return { count: 0 }
    const clean: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) { if (v !== undefined) clean[k] = v }
    await ref.set(clean, { merge: true })
    return { count: 1 }
  }
  async createReplayRun(run: ReplayRun): Promise<ReplayRun> {
    const db = await getFirestore()
    await db.collection(REPLAY_RUNS).doc(run.id).set(run, { merge: true })
    return run
  }
  async getReplayRun(id: string): Promise<ReplayRun | null> {
    const db = await getFirestore()
    const doc = await db.collection(REPLAY_RUNS).doc(id).get()
    return doc.exists ? docData<ReplayRun>(doc) : null
  }
  async listReplayRuns(filters: { patternId?: string; limit?: number }): Promise<ReplayRun[]> {
    const db = await getFirestore()
    let q: any = db.collection(REPLAY_RUNS)
    if (filters.patternId) q = q.where('patternId', '==', filters.patternId)
    const snap = await q.get()
    return snap.docs.map((d: any) => docData<ReplayRun>(d)).sort(byCreatedAtDesc).slice(0, filters.limit || 100)
  }

  // ── B19: Automatic Engine ────────────────────────────────────────────────────
  async createAutoEngineRun(run: AutoEngineRun): Promise<AutoEngineRun> {
    const db = await getFirestore()
    await db.collection(AUTO_RUNS).doc(run.id).set(run, { merge: true })
    return run
  }
  async updateAutoEngineRun(id: string, patch: Partial<AutoEngineRun>): Promise<{ count: number }> {
    const db = await getFirestore()
    const clean: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) { if (v !== undefined) clean[k] = v }
    await db.collection(AUTO_RUNS).doc(id).set(clean, { merge: true })
    return { count: 1 }
  }
  async getAutoEngineRun(id: string): Promise<AutoEngineRun | null> {
    const db = await getFirestore()
    const doc = await db.collection(AUTO_RUNS).doc(id).get()
    return doc.exists ? docData<AutoEngineRun>(doc) : null
  }
  async getLatestAutoEngineRun(): Promise<AutoEngineRun | null> {
    const db = await getFirestore()
    const snap = await db.collection(AUTO_RUNS).limit(READ_CAP).get()
    const rows = snap.docs.map((d: any) => docData<AutoEngineRun>(d)).sort((a: any, b: any) => (b.startedAt || '').localeCompare(a.startedAt || ''))
    return rows.length > 0 ? rows[0] : null
  }
  async listAutoEngineRuns(limit?: number): Promise<AutoEngineRun[]> {
    const db = await getFirestore()
    const snap = await db.collection(AUTO_RUNS).limit(READ_CAP).get()
    return snap.docs.map((d: any) => docData<AutoEngineRun>(d)).sort((a: any, b: any) => (b.startedAt || '').localeCompare(a.startedAt || '')).slice(0, limit || 100)
  }
  async upsertAutoOpportunity(opp: AutoOpportunity): Promise<AutoOpportunity> {
    const db = await getFirestore()
    await db.collection(AUTO_OPPS).doc(opp.id).set(opp, { merge: true })
    return opp
  }
  async getAutoOpportunity(id: string): Promise<AutoOpportunity | null> {
    const db = await getFirestore()
    const doc = await db.collection(AUTO_OPPS).doc(id).get()
    return doc.exists ? docData<AutoOpportunity>(doc) : null
  }
  async listAutoOpportunities(filters: { status?: string; type?: string; limit?: number }): Promise<AutoOpportunity[]> {
    const db = await getFirestore()
    let rows = (await db.collection(AUTO_OPPS).limit(READ_CAP).get()).docs.map((d: any) => docData<AutoOpportunity>(d))
    if (filters.status) rows = rows.filter((o: any) => o.status === filters.status)
    if (filters.type) rows = rows.filter((o: any) => o.opportunityType === filters.type)
    return rows.sort(byCreatedAtDesc).slice(0, filters.limit || 100)
  }
  async listAutoOpportunitiesByFixture(fixtureId: string, limit?: number): Promise<AutoOpportunity[]> {
    const db = await getFirestore()
    const snap = await db.collection(AUTO_OPPS).where('fixtureId', '==', fixtureId).get()
    return snap.docs.map((d: any) => docData<AutoOpportunity>(d)).sort(byCreatedAtDesc).slice(0, limit || 50)
  }

  // ── B21: opportunity actions / feedback / notes / user-state / promotion ────
  async createAutoOpportunityAction(action: AutoOpportunityAction): Promise<AutoOpportunityAction> {
    const db = await getFirestore()
    await db.collection(AUTO_ACTIONS).doc(action.id).set(action, { merge: true })
    return action
  }
  async listAutoOpportunityActions(limit?: number): Promise<AutoOpportunityAction[]> {
    const db = await getFirestore()
    const snap = await db.collection(AUTO_ACTIONS).limit(READ_CAP).get()
    return snap.docs.map((d: any) => docData<AutoOpportunityAction>(d)).sort(byCreatedAtDesc).slice(0, limit || 200)
  }
  async listAutoOpportunityActionsByOpportunity(opportunityId: string, limit?: number): Promise<AutoOpportunityAction[]> {
    const db = await getFirestore()
    const snap = await db.collection(AUTO_ACTIONS).where('opportunityId', '==', opportunityId).get()
    return snap.docs.map((d: any) => docData<AutoOpportunityAction>(d)).sort(byCreatedAtDesc).slice(0, limit || 200)
  }
  async upsertAutoOpportunityUserState(state: AutoOpportunityUserState): Promise<AutoOpportunityUserState> {
    const db = await getFirestore()
    await db.collection(AUTO_USER_STATES).doc(state.id).set(state, { merge: true })
    return state
  }
  async getAutoOpportunityUserState(opportunityId: string): Promise<AutoOpportunityUserState | null> {
    const db = await getFirestore()
    const doc = await db.collection(AUTO_USER_STATES).doc(`aus_${opportunityId}`).get()
    return doc.exists ? docData<AutoOpportunityUserState>(doc) : null
  }
  async listAutoOpportunityUserStates(limit?: number): Promise<AutoOpportunityUserState[]> {
    const db = await getFirestore()
    const snap = await db.collection(AUTO_USER_STATES).limit(READ_CAP).get()
    return snap.docs.map((d: any) => docData<AutoOpportunityUserState>(d)).slice(0, limit || 500)
  }
  async createAutoOpportunityPromotionPlan(plan: AutoOpportunityPromotionPlan): Promise<AutoOpportunityPromotionPlan> {
    const db = await getFirestore()
    await db.collection(AUTO_PROMOTIONS).doc(plan.id).set(plan, { merge: true })
    return plan
  }
  async getAutoOpportunityPromotionPlan(opportunityId: string): Promise<AutoOpportunityPromotionPlan | null> {
    const db = await getFirestore()
    const doc = await db.collection(AUTO_PROMOTIONS).doc(`apl_${opportunityId}`).get()
    return doc.exists ? docData<AutoOpportunityPromotionPlan>(doc) : null
  }
  async listAutoOpportunityPromotionPlans(limit?: number): Promise<AutoOpportunityPromotionPlan[]> {
    const db = await getFirestore()
    const snap = await db.collection(AUTO_PROMOTIONS).limit(READ_CAP).get()
    return snap.docs.map((d: any) => docData<AutoOpportunityPromotionPlan>(d)).sort(byCreatedAtDesc).slice(0, limit || 200)
  }

  // ── B22: manual opportunity → alert promotion links ─────────────────────────
  async createManualPromotedAlertLink(link: ManualPromotedAlertLink): Promise<ManualPromotedAlertLink> {
    const db = await getFirestore()
    await db.collection(AUTO_PROMOTED_LINKS).doc(link.id).set(link, { merge: true })
    return link
  }
  async getManualPromotedAlertLink(opportunityId: string): Promise<ManualPromotedAlertLink | null> {
    const db = await getFirestore()
    const doc = await db.collection(AUTO_PROMOTED_LINKS).doc(`mpa_${opportunityId}`).get()
    return doc.exists ? docData<ManualPromotedAlertLink>(doc) : null
  }
  async listManualPromotedAlertLinks(limit?: number): Promise<ManualPromotedAlertLink[]> {
    const db = await getFirestore()
    const snap = await db.collection(AUTO_PROMOTED_LINKS).limit(READ_CAP).get()
    return snap.docs.map((d: any) => docData<ManualPromotedAlertLink>(d)).sort(byCreatedAtDesc).slice(0, limit || 200)
  }

  // ── B23: promoted alert resolution outcome links + opportunity outcome summaries ──
  async createPromotedAlertOutcomeLink(link: PromotedAlertOutcomeLink): Promise<PromotedAlertOutcomeLink> {
    const db = await getFirestore()
    await db.collection(AUTO_PROMOTED_OUTCOME_LINKS).doc(link.id).set(link, { merge: true })
    return link
  }
  async getPromotedAlertOutcomeLinkByAlertId(alertId: string): Promise<PromotedAlertOutcomeLink | null> {
    const db = await getFirestore()
    const doc = await db.collection(AUTO_PROMOTED_OUTCOME_LINKS).doc(`pol_${alertId}`).get()
    return doc.exists ? docData<PromotedAlertOutcomeLink>(doc) : null
  }
  async getPromotedAlertOutcomeLinkByOpportunityId(opportunityId: string): Promise<PromotedAlertOutcomeLink | null> {
    const db = await getFirestore()
    const snap = await db.collection(AUTO_PROMOTED_OUTCOME_LINKS).where('opportunityId', '==', opportunityId).limit(1).get()
    return snap.empty ? null : docData<PromotedAlertOutcomeLink>(snap.docs[0])
  }
  async updatePromotedAlertOutcomeLink(alertId: string, patch: Partial<PromotedAlertOutcomeLink>): Promise<{ count: number }> {
    const db = await getFirestore()
    const ref = db.collection(AUTO_PROMOTED_OUTCOME_LINKS).doc(`pol_${alertId}`)
    const doc = await ref.get()
    if (!doc.exists) return { count: 0 }
    await ref.set(patch, { merge: true })
    return { count: 1 }
  }
  async upsertAutoOpportunityOutcomeSummary(summary: AutoOpportunityOutcomeSummary): Promise<AutoOpportunityOutcomeSummary> {
    const db = await getFirestore()
    await db.collection(AUTO_OUTCOME_SUMMARIES).doc(`oos_${summary.opportunityId}`).set(summary, { merge: true })
    return summary
  }
  async getAutoOpportunityOutcomeSummary(opportunityId: string): Promise<AutoOpportunityOutcomeSummary | null> {
    const db = await getFirestore()
    const doc = await db.collection(AUTO_OUTCOME_SUMMARIES).doc(`oos_${opportunityId}`).get()
    return doc.exists ? docData<AutoOpportunityOutcomeSummary>(doc) : null
  }
  async listAutoOpportunityOutcomeSummaries(limit?: number): Promise<AutoOpportunityOutcomeSummary[]> {
    const db = await getFirestore()
    const snap = await db.collection(AUTO_OUTCOME_SUMMARIES).limit(READ_CAP).get()
    return snap.docs.map((d: any) => docData<AutoOpportunityOutcomeSummary>(d))
      .sort((a: any, b: any) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, limit || 200)
  }

  // ── B24: Auto Engine learning & calibration ─────────────────────────────────
  async createAutoEngineLearningRun(run: AutoEngineLearningRun): Promise<AutoEngineLearningRun> {
    const db = await getFirestore()
    await db.collection(AUTO_LEARNING_RUNS).doc(run.id).set(run, { merge: true })
    return run
  }
  async getAutoEngineLearningRun(id: string): Promise<AutoEngineLearningRun | null> {
    const db = await getFirestore()
    const doc = await db.collection(AUTO_LEARNING_RUNS).doc(id).get()
    return doc.exists ? docData<AutoEngineLearningRun>(doc) : null
  }
  async listAutoEngineLearningRuns(limit?: number): Promise<AutoEngineLearningRun[]> {
    const db = await getFirestore()
    const snap = await db.collection(AUTO_LEARNING_RUNS).limit(READ_CAP).get()
    return snap.docs.map((d: any) => docData<AutoEngineLearningRun>(d))
      .sort((a: any, b: any) => (b.startedAt || '').localeCompare(a.startedAt || '')).slice(0, limit || 50)
  }
  async upsertAutoEngineLearningProfile(profile: AutoEngineLearningProfile): Promise<AutoEngineLearningProfile> {
    const db = await getFirestore()
    await db.collection(AUTO_LEARNING_PROFILES).doc(profile.id).set(profile, { merge: true })
    return profile
  }
  async getLatestAutoEngineLearningProfile(): Promise<AutoEngineLearningProfile | null> {
    const db = await getFirestore()
    const snap = await db.collection(AUTO_LEARNING_PROFILES).limit(READ_CAP).get()
    const all = snap.docs.map((d: any) => docData<AutoEngineLearningProfile>(d))
      .sort((a: any, b: any) => (b.generatedAt || '').localeCompare(a.generatedAt || ''))
    return all[0] || null
  }
  async getAutoOpportunityTypeProfile(type: string): Promise<AutoOpportunityTypeProfile | null> {
    const profile = await this.getLatestAutoEngineLearningProfile()
    return profile?.opportunityTypeProfiles.find(p => p.opportunityType === type) ?? null
  }
  async listAutoEngineLearningRecommendations(limit?: number): Promise<AutoEngineLearningRecommendation[]> {
    const profile = await this.getLatestAutoEngineLearningProfile()
    return profile?.recommendations.slice(0, limit || 50) ?? []
  }

  // ── B25: Auto Alert Policy Engine ───────────────────────────────────────────
  async createAutoAlertPolicy(policy: AutoAlertPolicy): Promise<AutoAlertPolicy> {
    const db = await getFirestore()
    await db.collection(AUTO_ALERT_POLICIES).doc(policy.id).set(policy, { merge: true })
    return policy
  }
  async updateAutoAlertPolicy(id: string, patch: Partial<AutoAlertPolicy>): Promise<{ count: number }> {
    const db = await getFirestore()
    const ref = db.collection(AUTO_ALERT_POLICIES).doc(id)
    const doc = await ref.get()
    if (!doc.exists) return { count: 0 }
    await ref.set(patch, { merge: true })
    return { count: 1 }
  }
  async getAutoAlertPolicy(id: string): Promise<AutoAlertPolicy | null> {
    const db = await getFirestore()
    const doc = await db.collection(AUTO_ALERT_POLICIES).doc(id).get()
    return doc.exists ? docData<AutoAlertPolicy>(doc) : null
  }
  async listAutoAlertPolicies(limit?: number): Promise<AutoAlertPolicy[]> {
    const db = await getFirestore()
    const snap = await db.collection(AUTO_ALERT_POLICIES).limit(READ_CAP).get()
    return snap.docs.map((d: any) => docData<AutoAlertPolicy>(d))
      .sort((a: any, b: any) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, limit || 200)
  }
  async createAutoAlertPolicyEvaluation(evaluation: AutoAlertPolicyEvaluation): Promise<AutoAlertPolicyEvaluation> {
    const db = await getFirestore()
    await db.collection(AUTO_ALERT_POLICY_EVALS).doc(evaluation.id).set(evaluation, { merge: true })
    return evaluation
  }
  async getAutoAlertPolicyEvaluation(id: string): Promise<AutoAlertPolicyEvaluation | null> {
    const db = await getFirestore()
    const doc = await db.collection(AUTO_ALERT_POLICY_EVALS).doc(id).get()
    return doc.exists ? docData<AutoAlertPolicyEvaluation>(doc) : null
  }
  async listAutoAlertPolicyEvaluations(limit?: number): Promise<AutoAlertPolicyEvaluation[]> {
    const db = await getFirestore()
    const snap = await db.collection(AUTO_ALERT_POLICY_EVALS).limit(READ_CAP).get()
    return snap.docs.map((d: any) => docData<AutoAlertPolicyEvaluation>(d))
      .sort((a: any, b: any) => (b.evaluatedAt || '').localeCompare(a.evaluatedAt || '')).slice(0, limit || 100)
  }
  async listAutoAlertPolicyEvaluationsByOpportunity(opportunityId: string, limit?: number): Promise<AutoAlertPolicyEvaluation[]> {
    const db = await getFirestore()
    const snap = await db.collection(AUTO_ALERT_POLICY_EVALS).where('opportunityId', '==', opportunityId).limit(READ_CAP).get()
    return snap.docs.map((d: any) => docData<AutoAlertPolicyEvaluation>(d))
      .sort((a: any, b: any) => (b.evaluatedAt || '').localeCompare(a.evaluatedAt || '')).slice(0, limit || 50)
  }
  async listAutoAlertPolicyEvaluationsByPolicy(policyId: string, limit?: number): Promise<AutoAlertPolicyEvaluation[]> {
    const db = await getFirestore()
    const snap = await db.collection(AUTO_ALERT_POLICY_EVALS).where('policyId', '==', policyId).limit(READ_CAP).get()
    return snap.docs.map((d: any) => docData<AutoAlertPolicyEvaluation>(d))
      .sort((a: any, b: any) => (b.evaluatedAt || '').localeCompare(a.evaluatedAt || '')).slice(0, limit || 100)
  }

  // ── B26: admin audit trail ──────────────────────────────────────────────────
  async createAdminAuditEntry(entry: AdminAuditEntry): Promise<AdminAuditEntry> {
    const db = await getFirestore()
    await db.collection(ADMIN_AUDIT).doc(entry.id).set(entry, { merge: true })
    return entry
  }
  async listAdminAuditEntries(limit?: number): Promise<AdminAuditEntry[]> {
    const db = await getFirestore()
    const snap = await db.collection(ADMIN_AUDIT).limit(READ_CAP).get()
    return snap.docs.map((d: any) => docData<AdminAuditEntry>(d))
      .sort(byCreatedAtDesc).slice(0, limit || 100)
  }

  // ── B32: snapshot retention run audit + local-ops metrics persistence ───────
  async createSnapshotRetentionRun(run: SnapshotRetentionRun): Promise<SnapshotRetentionRun> {
    const db = await getFirestore()
    await db.collection(SNAPSHOT_RETENTION_RUNS).doc(run.id).set(run, { merge: true })
    return run
  }
  async updateSnapshotRetentionRun(id: string, patch: Partial<SnapshotRetentionRun>): Promise<{ count: number }> {
    const db = await getFirestore()
    const ref = db.collection(SNAPSHOT_RETENTION_RUNS).doc(id)
    const doc = await ref.get()
    if (!doc.exists) return { count: 0 }
    const clean: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) { if (v !== undefined) clean[k] = v }
    await ref.set(clean, { merge: true })
    return { count: 1 }
  }
  async getSnapshotRetentionRun(id: string): Promise<SnapshotRetentionRun | null> {
    const db = await getFirestore()
    const doc = await db.collection(SNAPSHOT_RETENTION_RUNS).doc(id).get()
    return doc.exists ? docData<SnapshotRetentionRun>(doc) : null
  }
  async listSnapshotRetentionRuns(limit?: number): Promise<SnapshotRetentionRun[]> {
    const db = await getFirestore()
    const snap = await db.collection(SNAPSHOT_RETENTION_RUNS).limit(READ_CAP).get()
    return snap.docs.map((d: any) => docData<SnapshotRetentionRun>(d))
      .sort((a: any, b: any) => (b.startedAt || '').localeCompare(a.startedAt || '')).slice(0, limit || 50)
  }
  async createLocalOpsMetricsSnapshot(snapshot: LocalOpsMetricsSnapshot): Promise<LocalOpsMetricsSnapshot> {
    const db = await getFirestore()
    await db.collection(LOCAL_OPS_METRICS).doc(snapshot.id).set(snapshot, { merge: true })
    return snapshot
  }
  async listLocalOpsMetricsSnapshots(limit?: number): Promise<LocalOpsMetricsSnapshot[]> {
    const db = await getFirestore()
    const snap = await db.collection(LOCAL_OPS_METRICS).limit(READ_CAP).get()
    return snap.docs.map((d: any) => docData<LocalOpsMetricsSnapshot>(d))
      .sort((a: any, b: any) => (b.capturedAt || '').localeCompare(a.capturedAt || '')).slice(0, limit || 100)
  }

  // ── B33: evidence snapshot references ────────────────────────────────────────
  async createEvidenceSnapshotReference(ref: EvidenceSnapshotReference): Promise<EvidenceSnapshotReference> {
    const db = await getFirestore()
    await db.collection(EVIDENCE_REFS).doc(ref.id).set(ref, { merge: true })
    return ref
  }
  async createEvidenceSnapshotReferencesBatch(refs: EvidenceSnapshotReference[]): Promise<{ created: number }> {
    if (refs.length === 0) return { created: 0 }
    const db = await getFirestore()
    let created = 0
    // Chunk into batches of 400 (Firestore batch limit is 500).
    for (let i = 0; i < refs.length; i += 400) {
      const chunk = refs.slice(i, i + 400)
      const batch = db.batch()
      for (const ref of chunk) batch.set(db.collection(EVIDENCE_REFS).doc(ref.id), ref, { merge: true })
      await batch.commit()
      created += chunk.length
    }
    return { created }
  }
  async getEvidenceSnapshotReference(id: string): Promise<EvidenceSnapshotReference | null> {
    const db = await getFirestore()
    const doc = await db.collection(EVIDENCE_REFS).doc(id).get()
    return doc.exists ? docData<EvidenceSnapshotReference>(doc) : null
  }
  async listEvidenceSnapshotReferences(limit?: number): Promise<EvidenceSnapshotReference[]> {
    const db = await getFirestore()
    const snap = await db.collection(EVIDENCE_REFS).limit(READ_CAP).get()
    return snap.docs.map((d: any) => docData<EvidenceSnapshotReference>(d)).sort(byCreatedAtDesc).slice(0, limit || 200)
  }
  async listEvidenceSnapshotReferencesBySnapshot(snapshotId: string, limit?: number): Promise<EvidenceSnapshotReference[]> {
    const db = await getFirestore()
    const snap = await db.collection(EVIDENCE_REFS).where('snapshotId', '==', snapshotId).get()
    return snap.docs.map((d: any) => docData<EvidenceSnapshotReference>(d)).sort(byCreatedAtDesc).slice(0, limit || 200)
  }
  async listEvidenceSnapshotReferencesByFixture(fixtureId: string, limit?: number): Promise<EvidenceSnapshotReference[]> {
    const db = await getFirestore()
    const snap = await db.collection(EVIDENCE_REFS).where('fixtureId', '==', fixtureId).get()
    return snap.docs.map((d: any) => docData<EvidenceSnapshotReference>(d)).sort(byCreatedAtDesc).slice(0, limit || 200)
  }
  async listEvidenceSnapshotReferencesBySource(source: string, sourceId: string, limit?: number): Promise<EvidenceSnapshotReference[]> {
    const db = await getFirestore()
    const snap = await db.collection(EVIDENCE_REFS).where('source', '==', source).where('sourceId', '==', sourceId).get()
    return snap.docs.map((d: any) => docData<EvidenceSnapshotReference>(d)).sort(byCreatedAtDesc).slice(0, limit || 200)
  }
  async listEvidenceSnapshotReferencesByAlert(alertId: string, limit?: number): Promise<EvidenceSnapshotReference[]> {
    const db = await getFirestore()
    const snap = await db.collection(EVIDENCE_REFS).where('alertId', '==', alertId).get()
    return snap.docs.map((d: any) => docData<EvidenceSnapshotReference>(d)).sort(byCreatedAtDesc).slice(0, limit || 200)
  }
  async listEvidenceSnapshotReferencesByOpportunity(opportunityId: string, limit?: number): Promise<EvidenceSnapshotReference[]> {
    const db = await getFirestore()
    const snap = await db.collection(EVIDENCE_REFS).where('opportunityId', '==', opportunityId).get()
    return snap.docs.map((d: any) => docData<EvidenceSnapshotReference>(d)).sort(byCreatedAtDesc).slice(0, limit || 200)
  }

  // ── B36: backtest/replay evidence reprocess run audit ───────────────────────
  async createBacktestReplayEvidenceReprocessRun(run: BacktestReplayEvidenceReprocessRun): Promise<BacktestReplayEvidenceReprocessRun> {
    const db = await getFirestore()
    await db.collection(BT_REPLAY_REPROCESS_RUNS).doc(run.id).set(run, { merge: true })
    return run
  }
  async updateBacktestReplayEvidenceReprocessRun(id: string, patch: Partial<BacktestReplayEvidenceReprocessRun>): Promise<{ count: number }> {
    const db = await getFirestore()
    const ref = db.collection(BT_REPLAY_REPROCESS_RUNS).doc(id)
    const doc = await ref.get()
    if (!doc.exists) return { count: 0 }
    const clean: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) { if (v !== undefined) clean[k] = v }
    await ref.set(clean, { merge: true })
    return { count: 1 }
  }
  async getBacktestReplayEvidenceReprocessRun(id: string): Promise<BacktestReplayEvidenceReprocessRun | null> {
    const db = await getFirestore()
    const doc = await db.collection(BT_REPLAY_REPROCESS_RUNS).doc(id).get()
    return doc.exists ? docData<BacktestReplayEvidenceReprocessRun>(doc) : null
  }
  async listBacktestReplayEvidenceReprocessRuns(limit?: number): Promise<BacktestReplayEvidenceReprocessRun[]> {
    const db = await getFirestore()
    const snap = await db.collection(BT_REPLAY_REPROCESS_RUNS).limit(READ_CAP).get()
    return snap.docs.map((d: any) => docData<BacktestReplayEvidenceReprocessRun>(d))
      .sort((a: any, b: any) => (b.startedAt || '').localeCompare(a.startedAt || '')).slice(0, limit || 50)
  }

  // ── B37: live validation sessions ───────────────────────────────────────────
  async createLiveValidationSession(session: LiveValidationSession): Promise<LiveValidationSession> {
    const db = await getFirestore(); await db.collection(LV_SESSIONS).doc(session.id).set(session, { merge: true }); return session
  }
  async updateLiveValidationSession(id: string, patch: Partial<LiveValidationSession>): Promise<{ count: number }> {
    const db = await getFirestore(); const ref = db.collection(LV_SESSIONS).doc(id); const doc = await ref.get()
    if (!doc.exists) return { count: 0 }
    const clean: Record<string, unknown> = {}; for (const [k, v] of Object.entries(patch)) { if (v !== undefined) clean[k] = v }
    await ref.set(clean, { merge: true }); return { count: 1 }
  }
  async getLiveValidationSession(id: string): Promise<LiveValidationSession | null> {
    const db = await getFirestore(); const doc = await db.collection(LV_SESSIONS).doc(id).get(); return doc.exists ? docData<LiveValidationSession>(doc) : null
  }
  async listLiveValidationSessions(limit?: number): Promise<LiveValidationSession[]> {
    const db = await getFirestore(); const snap = await db.collection(LV_SESSIONS).limit(READ_CAP).get()
    return snap.docs.map((d: any) => docData<LiveValidationSession>(d)).sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, limit || 50)
  }
  async addLiveValidationSessionFixture(fixture: LiveValidationSessionFixture): Promise<LiveValidationSessionFixture> {
    const db = await getFirestore(); await db.collection(LV_FIXTURES).doc(fixture.id).set(fixture, { merge: true }); return fixture
  }
  async updateLiveValidationSessionFixture(id: string, patch: Partial<LiveValidationSessionFixture>): Promise<{ count: number }> {
    const db = await getFirestore(); const ref = db.collection(LV_FIXTURES).doc(id); const doc = await ref.get()
    if (!doc.exists) return { count: 0 }
    const clean: Record<string, unknown> = {}; for (const [k, v] of Object.entries(patch)) { if (v !== undefined) clean[k] = v }
    await ref.set(clean, { merge: true }); return { count: 1 }
  }
  async listLiveValidationSessionFixtures(sessionId: string, limit?: number): Promise<LiveValidationSessionFixture[]> {
    const db = await getFirestore(); const snap = await db.collection(LV_FIXTURES).where('sessionId', '==', sessionId).get()
    return snap.docs.map((d: any) => docData<LiveValidationSessionFixture>(d)).slice(0, limit || 500)
  }
  async createLiveValidationSessionEvent(event: LiveValidationSessionEvent): Promise<LiveValidationSessionEvent> {
    const db = await getFirestore(); await db.collection(LV_EVENTS).doc(event.id).set(event, { merge: true }); return event
  }
  async listLiveValidationSessionEvents(sessionId: string, limit?: number): Promise<LiveValidationSessionEvent[]> {
    const db = await getFirestore(); const snap = await db.collection(LV_EVENTS).where('sessionId', '==', sessionId).get()
    return snap.docs.map((d: any) => docData<LiveValidationSessionEvent>(d)).sort(byCreatedAtDesc).slice(0, limit || 1000)
  }
  async createLiveValidationSessionReport(report: LiveValidationSessionReport): Promise<LiveValidationSessionReport> {
    const db = await getFirestore(); await db.collection(LV_REPORTS).doc(report.id).set(report, { merge: true }); return report
  }
  async getLiveValidationSessionReport(sessionId: string): Promise<LiveValidationSessionReport | null> {
    const db = await getFirestore(); const snap = await db.collection(LV_REPORTS).where('sessionId', '==', sessionId).get()
    const rows = snap.docs.map((d: any) => docData<LiveValidationSessionReport>(d)).sort((a: any, b: any) => (b.generatedAt || '').localeCompare(a.generatedAt || ''))
    return rows[0] || null
  }
  async listLiveValidationSessionReports(limit?: number): Promise<LiveValidationSessionReport[]> {
    const db = await getFirestore(); const snap = await db.collection(LV_REPORTS).limit(READ_CAP).get()
    return snap.docs.map((d: any) => docData<LiveValidationSessionReport>(d)).sort((a: any, b: any) => (b.generatedAt || '').localeCompare(a.generatedAt || '')).slice(0, limit || 50)
  }

  // ── B39: record index + scoped metrics + dynamic attach ─────────────────────
  async createLiveValidationRecordLink(link: LiveValidationRecordLink): Promise<LiveValidationRecordLink> {
    const db = await getFirestore(); await db.collection(LV_RECORD_LINKS).doc(link.id).set(link, { merge: true }); return link
  }
  async createLiveValidationRecordLinksBatch(links: LiveValidationRecordLink[]): Promise<{ created: number }> {
    if (links.length === 0) return { created: 0 }
    const db = await getFirestore(); let created = 0
    for (let i = 0; i < links.length; i += 400) {
      const chunk = links.slice(i, i + 400); const batch = db.batch()
      for (const l of chunk) batch.set(db.collection(LV_RECORD_LINKS).doc(l.id), l, { merge: true })
      await batch.commit(); created += chunk.length
    }
    return { created }
  }
  async listLiveValidationRecordLinks(limit?: number): Promise<LiveValidationRecordLink[]> {
    const db = await getFirestore(); const snap = await db.collection(LV_RECORD_LINKS).limit(READ_CAP).get()
    return snap.docs.map((d: any) => docData<LiveValidationRecordLink>(d)).sort(byCreatedAtDesc).slice(0, limit || 500)
  }
  async listLiveValidationRecordLinksBySession(validationSessionId: string, limit?: number): Promise<LiveValidationRecordLink[]> {
    const db = await getFirestore(); const snap = await db.collection(LV_RECORD_LINKS).where('validationSessionId', '==', validationSessionId).get()
    return snap.docs.map((d: any) => docData<LiveValidationRecordLink>(d)).sort(byCreatedAtDesc).slice(0, limit || 1000)
  }
  async listLiveValidationRecordLinksByRecord(recordId: string, limit?: number): Promise<LiveValidationRecordLink[]> {
    const db = await getFirestore(); const snap = await db.collection(LV_RECORD_LINKS).where('recordId', '==', recordId).get()
    return snap.docs.map((d: any) => docData<LiveValidationRecordLink>(d)).slice(0, limit || 50)
  }
  async listLiveValidationRecordLinksByFixture(fixtureId: string, limit?: number): Promise<LiveValidationRecordLink[]> {
    const db = await getFirestore(); const snap = await db.collection(LV_RECORD_LINKS).where('fixtureId', '==', fixtureId).get()
    return snap.docs.map((d: any) => docData<LiveValidationRecordLink>(d)).slice(0, limit || 200)
  }
  async upsertLiveValidationSessionMetricCounter(counter: LiveValidationSessionMetricCounter): Promise<LiveValidationSessionMetricCounter> {
    const db = await getFirestore(); await db.collection(LV_METRIC_COUNTERS).doc(counter.id).set(counter, { merge: true }); return counter
  }
  async getLiveValidationSessionMetricCounter(validationSessionId: string, bucketKey: string): Promise<LiveValidationSessionMetricCounter | null> {
    const db = await getFirestore(); const doc = await db.collection(LV_METRIC_COUNTERS).doc(`lvm_${validationSessionId}_${bucketKey}`).get()
    return doc.exists ? docData<LiveValidationSessionMetricCounter>(doc) : null
  }
  async listLiveValidationSessionMetricCounters(validationSessionId: string, limit?: number): Promise<LiveValidationSessionMetricCounter[]> {
    const db = await getFirestore(); const snap = await db.collection(LV_METRIC_COUNTERS).where('validationSessionId', '==', validationSessionId).get()
    return snap.docs.map((d: any) => docData<LiveValidationSessionMetricCounter>(d)).slice(0, limit || 100)
  }
  async createDynamicFixtureAttachRun(run: DynamicFixtureAttachRun): Promise<DynamicFixtureAttachRun> {
    const db = await getFirestore(); await db.collection(LV_ATTACH_RUNS).doc(run.id).set(run, { merge: true }); return run
  }
  async updateDynamicFixtureAttachRun(id: string, patch: Partial<DynamicFixtureAttachRun>): Promise<{ count: number }> {
    const db = await getFirestore(); const ref = db.collection(LV_ATTACH_RUNS).doc(id); const doc = await ref.get()
    if (!doc.exists) return { count: 0 }
    const clean: Record<string, unknown> = {}; for (const [k, v] of Object.entries(patch)) { if (v !== undefined) clean[k] = v }
    await ref.set(clean, { merge: true }); return { count: 1 }
  }
  async listDynamicFixtureAttachRuns(validationSessionId: string, limit?: number): Promise<DynamicFixtureAttachRun[]> {
    const db = await getFirestore(); const snap = await db.collection(LV_ATTACH_RUNS).where('validationSessionId', '==', validationSessionId).get()
    return snap.docs.map((d: any) => docData<DynamicFixtureAttachRun>(d)).sort((a: any, b: any) => (b.startedAt || '').localeCompare(a.startedAt || '')).slice(0, limit || 50)
  }
  async getDynamicFixtureAttachRun(id: string): Promise<DynamicFixtureAttachRun | null> {
    const db = await getFirestore(); const doc = await db.collection(LV_ATTACH_RUNS).doc(id).get()
    return doc.exists ? docData<DynamicFixtureAttachRun>(doc) : null
  }
}
