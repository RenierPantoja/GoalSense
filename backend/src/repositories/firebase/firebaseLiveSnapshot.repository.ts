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
import { env } from '../../env.js'

const COLLECTION = 'liveSnapshots'

const HIDDEN_STATES = new Set(['soft_deleted', 'hard_deleted'])
/** A doc with no lifecycleState is implicitly active → visible. */
function isVisible(d: Json): boolean { return !HIDDEN_STATES.has(String(d.lifecycleState || 'active')) }

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
    const rows = snap.docs.map(docData).filter(isVisible).sort(byCapturedAtDesc)
    return rows[0] || null
  }

  async findAfter(fixtureId: string, afterDate: Date, limit?: number): Promise<Json[]> {
    const db = await getFirestore()
    const afterIso = afterDate.toISOString()
    const snap = await db.collection(COLLECTION).where('fixtureId', '==', fixtureId).get()
    const rows = snap.docs.map(docData)
      .filter(isVisible)
      .filter((s: Json) => (s.capturedAt || '') > afterIso)
      .sort(byCapturedAtAsc) // chronological for window analysis
    return rows.slice(0, limit || 50)
  }

  async listRecent(filters: { fixtureId?: string; limit?: number }): Promise<Json[]> {
    const db = await getFirestore()
    const take = filters.limit || 20
    if (filters.fixtureId) {
      const snap = await db.collection(COLLECTION).where('fixtureId', '==', filters.fixtureId).get()
      return snap.docs.map(docData).filter(isVisible).sort(byCapturedAtDesc).slice(0, take)
    }
    // No fixtureId → single-field orderBy uses the automatic index, then filter.
    const snap = await db.collection(COLLECTION).orderBy('capturedAt', 'desc').limit(take * 2).get()
    return snap.docs.map(docData).filter(isVisible).slice(0, take)
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

  // ── B32: snapshot lifecycle ────────────────────────────────────────────────

  async listLiveSnapshotsForRetention(params: { limit?: number; includeSoftDeleted?: boolean }): Promise<Json[]> {
    const db = await getFirestore()
    const take = params.limit || 500
    const snap = await db.collection(COLLECTION).orderBy('capturedAt', 'desc').limit(take).get()
    const rows = snap.docs.map(docData)
    // hard_deleted are physically gone; soft_deleted included only when requested.
    return params.includeSoftDeleted ? rows : rows.filter((d: Json) => String(d.lifecycleState || 'active') !== 'soft_deleted')
  }

  async getLiveSnapshotLifecycle(snapshotId: string): Promise<Json | null> {
    const db = await getFirestore()
    const doc = await db.collection(COLLECTION).doc(snapshotId).get()
    if (!doc.exists) return null
    const d = docData(doc)
    return {
      id: d.id,
      fixtureId: d.fixtureId ?? null,
      lifecycleState: d.lifecycleState || 'active',
      deletedAt: d.deletedAt ?? null,
      deletedBy: d.deletedBy ?? null,
      deletionReason: d.deletionReason ?? null,
      markedAt: d.markedAt ?? null,
      retentionRunId: d.retentionRunId ?? null,
    }
  }

  async updateLiveSnapshotLifecycle(snapshotId: string, lifecycle: Json): Promise<{ count: number }> {
    const db = await getFirestore()
    const ref = db.collection(COLLECTION).doc(snapshotId)
    const doc = await ref.get()
    if (!doc.exists) return { count: 0 }
    const patch: Json = {}
    for (const [k, v] of Object.entries(lifecycle)) { if (v !== undefined) patch[k] = v }
    await ref.update(patch)
    return { count: 1 }
  }

  async markLiveSnapshotForDeletion(snapshotId: string, metadata: Json): Promise<{ count: number; supported: boolean }> {
    const r = await this.updateLiveSnapshotLifecycle(snapshotId, {
      lifecycleState: 'marked_for_deletion',
      markedAt: new Date().toISOString(),
      retentionRunId: metadata.retentionRunId ?? null,
      deletionReason: metadata.deletionReason ?? null,
    })
    return { count: r.count, supported: true }
  }

  async softDeleteLiveSnapshot(snapshotId: string, metadata: Json): Promise<{ count: number; supported: boolean }> {
    const r = await this.updateLiveSnapshotLifecycle(snapshotId, {
      lifecycleState: 'soft_deleted',
      deletedAt: new Date().toISOString(),
      deletedBy: metadata.deletedBy ?? null,
      deletionReason: metadata.deletionReason ?? null,
      retentionRunId: metadata.retentionRunId ?? null,
    })
    return { count: r.count, supported: true }
  }

  async restoreSoftDeletedLiveSnapshot(snapshotId: string): Promise<{ count: number; supported: boolean }> {
    const r = await this.updateLiveSnapshotLifecycle(snapshotId, {
      lifecycleState: 'active', deletedAt: null, deletedBy: null, deletionReason: null,
    })
    return { count: r.count, supported: true }
  }

  async hardDeleteLiveSnapshot(snapshotId: string): Promise<{ count: number; supported: boolean }> {
    // Master safety: hard delete only when explicitly enabled, and only for a doc
    // already soft_deleted/marked (the caller — retention service — also enforces
    // protection). Never deletes an active or protected snapshot here.
    if (String(env.ENABLE_SNAPSHOT_HARD_DELETE).toLowerCase() !== 'true') return { count: 0, supported: false }
    const db = await getFirestore()
    const ref = db.collection(COLLECTION).doc(snapshotId)
    const doc = await ref.get()
    if (!doc.exists) return { count: 0, supported: true }
    const state = String((doc.data() as any)?.lifecycleState || 'active')
    if (state !== 'soft_deleted' && state !== 'marked_for_deletion') return { count: 0, supported: true }
    await ref.delete()
    return { count: 1, supported: true }
  }
}
