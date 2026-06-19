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
import type { IntelligenceRepository } from '../contracts.js'
import type {
  SignalLedgerEntry, AlertOutcomeRecord, SignalFailureAnalysis,
  MissedOpportunityRecord, LearningEvent, IntelligenceOverview, AlertResult,
} from '../../modules/intelligence/contracts/intelligence.types.js'
import type {
  LearningAggregationRun, PatternLearningProfile, CompetitionLearningProfile,
  TeamLearningProfile, SignalContextStats, LearningRecommendation,
} from '../../modules/intelligence/contracts/learning.types.js'
import type {
  BacktestRun, ReplayRun, PersistedBacktestSignalResult,
} from '../../modules/intelligence/backtest/backtest.types.js'

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
}
