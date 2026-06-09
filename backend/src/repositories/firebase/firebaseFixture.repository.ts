/**
 * Firebase Fixture Repository (Phase E4)
 * ─────────────────────────────────────────────────────────────────────────────
 * Firestore implementation of FixtureRepository.
 * Collection: fixtures/{provider}__{providerFixtureId}   (deterministic id)
 *
 * Notes:
 * - Deterministic id (provider + providerFixtureId) → idempotent creates, no
 *   duplicates for the same provider match. Cross-provider dedup is still handled
 *   by the service via findByCanonicalKey (returns the existing fixture id).
 * - The upsert / status-regression logic lives in liveMonitor.service
 *   (shouldUpdateStatus); this adapter only does CRUD.
 * - Date values (startTime) are normalized to ISO strings.
 * - Updates never overwrite a field with undefined.
 * - Single-equality / `in` queries + in-memory sort to avoid mandatory composite
 *   indexes at current volume.
 */
import { getFirestore } from '../../firebase/admin.js'
import type { FixtureRepository, Json } from '../contracts.js'

const COLLECTION = 'fixtures'

function fixtureDocId(provider: string, providerFixtureId: string): string {
  // Firestore doc ids cannot contain '/'. Provider/fixture ids are slugs/numbers,
  // but sanitize defensively.
  return `${provider}__${providerFixtureId}`.replace(/\//g, '_')
}

function docData(doc: any): Json {
  return { id: doc.id, ...doc.data() }
}

function normalizeValue(v: any): any {
  if (v instanceof Date) return v.toISOString()
  return v
}

function normalizeInput(input: Json): Json {
  const out: Json = {}
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue
    out[k] = normalizeValue(v)
  }
  return out
}

export class FirebaseFixtureRepository implements FixtureRepository {
  async findById(id: string): Promise<Json | null> {
    const db = await getFirestore()
    const doc = await db.collection(COLLECTION).doc(id).get()
    return doc.exists ? docData(doc) : null
  }

  async findByProviderId(provider: string, providerFixtureId: string): Promise<Json | null> {
    const db = await getFirestore()
    // Deterministic id makes this a direct doc lookup.
    const doc = await db.collection(COLLECTION).doc(fixtureDocId(provider, providerFixtureId)).get()
    return doc.exists ? docData(doc) : null
  }

  async findByCanonicalKey(canonicalKey: string): Promise<Json | null> {
    const db = await getFirestore()
    const snap = await db.collection(COLLECTION).where('canonicalKey', '==', canonicalKey).limit(1).get()
    if (snap.empty) return null
    return docData(snap.docs[0])
  }

  async listLive(statuses: string[], limit?: number): Promise<Json[]> {
    const db = await getFirestore()
    if (statuses.length === 0) return []
    // Firestore 'in' supports up to 30 values; live status sets are small.
    const snap = await db.collection(COLLECTION).where('status', 'in', statuses).get()
    const rows = snap.docs.map(docData).sort((a: Json, b: Json) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
    return limit ? rows.slice(0, limit) : rows
  }

  async create(input: Json): Promise<Json> {
    const db = await getFirestore()
    const now = new Date().toISOString()
    const data = {
      ...normalizeInput(input),
      createdAt: now,
      updatedAt: now,
    }
    const id = fixtureDocId(input.provider, input.providerFixtureId)
    await db.collection(COLLECTION).doc(id).set(data, { merge: true })
    return { id, ...data }
  }

  async update(id: string, patch: Json): Promise<Json> {
    const db = await getFirestore()
    const clean = normalizeInput(patch)
    clean.updatedAt = new Date().toISOString()
    await db.collection(COLLECTION).doc(id).set(clean, { merge: true })
    const doc = await db.collection(COLLECTION).doc(id).get()
    return docData(doc)
  }
}
