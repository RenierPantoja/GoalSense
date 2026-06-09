/**
 * Firebase Alert Repository (Phase E3)
 * ─────────────────────────────────────────────────────────────────────────────
 * Firestore implementation of AlertRepository.
 * Collection: alerts/{alertId}
 *
 * Notes:
 * - evidenceJson / temporalEvidenceJson stored as strings exactly like Prisma.
 * - createdAt / updatedAt are ISO strings; ISO sorts lexicographically by time.
 * - updates use merge and never overwrite evidenceJson with undefined.
 * - status 'unknown' is preserved as-is (never coerced to 'failed').
 * - Single-equality queries + in-memory filter/sort to avoid mandatory composite
 *   indexes at current volume. Recommended composite indexes documented in
 *   FIREBASE_PATTERNS_ALERTS_MIGRATION.md for production scale.
 */
import { getFirestore } from '../../firebase/admin.js'
import type { AlertRepository, Json } from '../contracts.js'

const COLLECTION = 'alerts'

function docData(doc: any): Json {
  return { id: doc.id, ...doc.data() }
}

function byCreatedAtDesc(a: Json, b: Json): number {
  return (b.createdAt || '').localeCompare(a.createdAt || '')
}

export class FirebaseAlertRepository implements AlertRepository {
  async list(filters: { userId: string; status?: string; patternId?: string; limit?: number }): Promise<Json[]> {
    const db = await getFirestore()
    const snap = await db.collection(COLLECTION).where('userId', '==', filters.userId).get()
    let rows = snap.docs.map(docData)
    if (filters.status) rows = rows.filter((a: Json) => a.status === filters.status)
    if (filters.patternId) rows = rows.filter((a: Json) => a.patternId === filters.patternId)
    rows.sort(byCreatedAtDesc)
    return rows.slice(0, filters.limit || 50)
  }

  async listForApprovalQueue(filters: { userId: string; minConfidence?: number; status?: string; sinceMs?: number; limit?: number }): Promise<Json[]> {
    const db = await getFirestore()
    const snap = await db.collection(COLLECTION).where('userId', '==', filters.userId).get()
    let rows = snap.docs.map(docData)
    if (filters.minConfidence != null) rows = rows.filter((a: Json) => (a.confidence ?? 0) >= filters.minConfidence!)
    if (filters.status) rows = rows.filter((a: Json) => a.status === filters.status)
    const cutoff = new Date(Date.now() - (filters.sinceMs ?? 24 * 60 * 60 * 1000)).toISOString()
    rows = rows.filter((a: Json) => (a.createdAt || '') >= cutoff)
    rows.sort(byCreatedAtDesc)
    return rows.slice(0, filters.limit || 200)
  }

  async findById(id: string, userId: string): Promise<Json | null> {
    const db = await getFirestore()
    const doc = await db.collection(COLLECTION).doc(id).get()
    if (!doc.exists) return null
    const data = docData(doc)
    if (data.userId !== userId) return null
    return data
  }

  async findByFixtureIds(fixtureId: string): Promise<Json[]> {
    const db = await getFirestore()
    const snap = await db.collection(COLLECTION).where('fixtureId', '==', fixtureId).get()
    return snap.docs.slice(0, 50).map((d: any) => ({ id: d.id }))
  }

  async findByDuplicateSignature(signature: string, sinceMs: number, userId: string): Promise<Json | null> {
    const db = await getFirestore()
    const snap = await db.collection(COLLECTION).where('duplicateSignature', '==', signature).get()
    const cutoff = new Date(Date.now() - sinceMs).toISOString()
    const rows = snap.docs.map(docData)
      .filter((a: Json) => a.userId === userId && (a.createdAt || '') >= cutoff)
      .sort(byCreatedAtDesc)
    return rows.length > 0 ? rows[0] : null
  }

  async findRecentByPatternFixture(patternId: string, fixtureId: string, sinceMs: number, userId: string): Promise<Json | null> {
    const db = await getFirestore()
    const snap = await db.collection(COLLECTION).where('patternId', '==', patternId).get()
    const cutoff = new Date(Date.now() - sinceMs).toISOString()
    const rows = snap.docs.map(docData)
      .filter((a: Json) => a.fixtureId === fixtureId && a.userId === userId && (a.createdAt || '') >= cutoff)
      .sort(byCreatedAtDesc)
    return rows.length > 0 ? rows[0] : null
  }

  async create(input: Json, userId: string): Promise<Json> {
    const db = await getFirestore()
    const now = new Date().toISOString()
    const data = {
      userId,
      patternId: input.patternId,
      fixtureId: input.fixtureId,
      status: input.status ?? 'pending',
      confidence: input.confidence,
      signalState: input.signalState ?? 'ready_to_alert',
      triggerMinute: input.triggerMinute ?? null,
      triggerScoreHome: input.triggerScoreHome ?? 0,
      triggerScoreAway: input.triggerScoreAway ?? 0,
      evidenceJson: input.evidenceJson ?? '[]',
      temporalEvidenceJson: input.temporalEvidenceJson ?? null,
      duplicateSignature: input.duplicateSignature ?? null,
      createdAt: now,
      updatedAt: now,
    }
    const ref = await db.collection(COLLECTION).add(data)
    return { id: ref.id, ...data }
  }

  async updateStatus(id: string, status: string): Promise<Json> {
    const db = await getFirestore()
    await db.collection(COLLECTION).doc(id).set(
      { status, updatedAt: new Date().toISOString() },
      { merge: true },
    )
    const doc = await db.collection(COLLECTION).doc(id).get()
    return docData(doc)
  }

  async listPending(userId: string, limit: number): Promise<Json[]> {
    const db = await getFirestore()
    const snap = await db.collection(COLLECTION).where('userId', '==', userId).get()
    const rows = snap.docs.map(docData)
      .filter((a: Json) => a.status === 'pending')
      .sort((a: Json, b: Json) => (a.createdAt || '').localeCompare(b.createdAt || '')) // oldest first
    return rows.slice(0, limit)
  }
}
