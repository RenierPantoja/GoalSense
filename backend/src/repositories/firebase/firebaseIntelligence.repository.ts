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

const LEDGER = 'signalLedger'
const OUTCOMES = 'alertOutcomes'
const FAILURES = 'signalFailures'
const MISSED = 'missedOpportunities'
const LEARNING = 'learningEvents'

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
}
