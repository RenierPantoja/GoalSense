/**
 * Firebase Live Snapshot Repository (Phase E4)
 * ─────────────────────────────────────────────────────────────────────────────
 * Firestore implementation of LiveSnapshotRepository.
 * Collection: liveSnapshots/{autoId}   (indexed by fixtureId + capturedAt)
 *
 * Notes:
 * - Each snapshot is an immutable record (auto id); history is never overwritten.
 * - statsJson / eventsJson are stored exactly as provided (strings or null),
 *   matching the Prisma contract. Empty payloads stay null → not treated as rich.
 * - capturedAt is an ISO string (stamped on create if not provided); ISO sorts
 *   lexicographically by time, so string comparison drives ordering/windows.
 * - findLatestByFixture / findAfter use a single-equality (fixtureId) query +
 *   in-memory sort to avoid a mandatory composite index at current volume.
 *   listRecent without a fixtureId uses orderBy(capturedAt desc) which relies on
 *   the automatic single-field index. Recommended composite indexes for scale
 *   are documented in FIREBASE_FIXTURES_SNAPSHOTS_MIGRATION.md.
 */
import { getFirestore } from '../../firebase/admin.js'
import type { LiveSnapshotRepository, Json } from '../contracts.js'

const COLLECTION = 'liveSnapshots'

function docData(doc: any): Json {
  return { id: doc.id, ...doc.data() }
}

function toIso(v: any): string {
  if (v instanceof Date) return v.toISOString()
  return String(v)
}

function byCapturedAtDesc(a: Json, b: Json): number {
  return (b.capturedAt || '').localeCompare(a.capturedAt || '')
}

function byCapturedAtAsc(a: Json, b: Json): number {
  return (a.capturedAt || '').localeCompare(b.capturedAt || '')
}

export class FirebaseLiveSnapshotRepository implements LiveSnapshotRepository {
  async findLatestByFixture(fixtureId: string): Promise<Json | null> {
    const db = await getFirestore()
    const snap = await db.collection(COLLECTION).where('fixtureId', '==', fixtureId).get()
    if (snap.empty) return null
    const rows = snap.docs.map(docData).sort(byCapturedAtDesc)
    return rows[0]
  }

  async findAfter(fixtureId: string, afterDate: Date, limit?: number): Promise<Json[]> {
    const db = await getFirestore()
    const afterIso = afterDate.toISOString()
    const snap = await db.collection(COLLECTION).where('fixtureId', '==', fixtureId).get()
    const rows = snap.docs.map(docData)
      .filter((s: Json) => (s.capturedAt || '') > afterIso)
      .sort(byCapturedAtAsc) // chronological for window analysis
    return rows.slice(0, limit || 50)
  }

  async listRecent(filters: { fixtureId?: string; limit?: number }): Promise<Json[]> {
    const db = await getFirestore()
    const take = filters.limit || 20
    if (filters.fixtureId) {
      const snap = await db.collection(COLLECTION).where('fixtureId', '==', filters.fixtureId).get()
      return snap.docs.map(docData).sort(byCapturedAtDesc).slice(0, take)
    }
    // No fixtureId → single-field orderBy uses the automatic index.
    const snap = await db.collection(COLLECTION).orderBy('capturedAt', 'desc').limit(take).get()
    return snap.docs.map(docData)
  }

  async create(input: Json): Promise<Json> {
    const db = await getFirestore()
    const now = new Date().toISOString()
    const data: Json = {}
    for (const [k, v] of Object.entries(input)) {
      if (v === undefined) continue
      data[k] = v instanceof Date ? v.toISOString() : v
    }
    data.capturedAt = input.capturedAt ? toIso(input.capturedAt) : now
    data.createdAt = now
    const ref = await db.collection(COLLECTION).add(data)
    return { id: ref.id, ...data }
  }
}
