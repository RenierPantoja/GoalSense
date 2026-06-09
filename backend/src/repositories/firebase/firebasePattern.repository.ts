/**
 * Firebase Pattern Repository (Phase E3)
 * ─────────────────────────────────────────────────────────────────────────────
 * Firestore implementation of PatternRepository.
 * Collection: patterns/{patternId}
 *
 * Notes:
 * - archive() is a soft delete (status='archived'), matching the Prisma path.
 * - JSON fields (conditionsJson, scopeFilterJson, extendedJson) are stored as
 *   strings exactly like Prisma, so payloads are identical across providers.
 * - createdAt / updatedAt are ISO strings.
 * - Single-equality (userId) queries + in-memory sort to avoid mandatory
 *   composite indexes at current volume (one default user).
 */
import { getFirestore } from '../../firebase/admin.js'
import type { PatternRepository, Json } from '../contracts.js'

const COLLECTION = 'patterns'

function docData(doc: any): Json {
  return { id: doc.id, ...doc.data() }
}

function byUpdatedAtDesc(a: Json, b: Json): number {
  return (b.updatedAt || '').localeCompare(a.updatedAt || '')
}

export class FirebasePatternRepository implements PatternRepository {
  /** All patterns for the user (including archived), newest-updated first. */
  async listAll(userId: string): Promise<Json[]> {
    const db = await getFirestore()
    const snap = await db.collection(COLLECTION).where('userId', '==', userId).get()
    return snap.docs.map(docData).sort(byUpdatedAtDesc)
  }

  /** Only active patterns. */
  async listActive(userId: string): Promise<Json[]> {
    const db = await getFirestore()
    const snap = await db.collection(COLLECTION).where('userId', '==', userId).get()
    return snap.docs.map(docData).filter((p: Json) => p.status === 'active').sort(byUpdatedAtDesc)
  }

  async findById(id: string, userId: string): Promise<Json | null> {
    const db = await getFirestore()
    const doc = await db.collection(COLLECTION).doc(id).get()
    if (!doc.exists) return null
    const data = docData(doc)
    if (data.userId !== userId) return null
    return data
  }

  async create(input: Json, userId: string): Promise<Json> {
    const db = await getFirestore()
    const now = new Date().toISOString()
    const data = {
      userId,
      name: input.name,
      description: input.description ?? '',
      status: input.status ?? 'paused',
      severity: input.severity ?? 'attention',
      scope: input.scope ?? 'all',
      action: input.action ?? 'register_alert',
      minConfidence: input.minConfidence ?? 50,
      requireRichData: input.requireRichData ?? false,
      onlyLive: input.onlyLive ?? false,
      onlyPreMatch: input.onlyPreMatch ?? false,
      conditionsJson: input.conditionsJson ?? '[]',
      scopeFilterJson: input.scopeFilterJson ?? null,
      extendedJson: input.extendedJson ?? null,
      templateId: input.templateId ?? null,
      createdAt: now,
      updatedAt: now,
    }
    const ref = await db.collection(COLLECTION).add(data)
    return { id: ref.id, ...data }
  }

  /** Partial update scoped to the owner. Returns { count } like updateMany. */
  async update(id: string, patch: Json, userId: string): Promise<{ count: number }> {
    const db = await getFirestore()
    const doc = await db.collection(COLLECTION).doc(id).get()
    if (!doc.exists || doc.data()?.userId !== userId) return { count: 0 }
    const clean: Json = {}
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue // never overwrite with undefined → preserves existing JSON fields
      clean[k] = v
    }
    clean.updatedAt = new Date().toISOString()
    await db.collection(COLLECTION).doc(id).set(clean, { merge: true })
    return { count: 1 }
  }

  /** Soft delete: status='archived'. Returns { count } like updateMany. */
  async archive(id: string, userId: string): Promise<{ count: number }> {
    const db = await getFirestore()
    const doc = await db.collection(COLLECTION).doc(id).get()
    if (!doc.exists || doc.data()?.userId !== userId) return { count: 0 }
    await db.collection(COLLECTION).doc(id).set(
      { status: 'archived', updatedAt: new Date().toISOString() },
      { merge: true },
    )
    return { count: 1 }
  }
}
