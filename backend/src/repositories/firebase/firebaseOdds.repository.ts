/**
 * Firebase Odds Repository (Phase E5)
 * ─────────────────────────────────────────────────────────────────────────────
 * Firestore implementation of OddsRepository.
 * Collections:
 *   oddsSnapshots/{autoId}                    point-in-time, history preserved
 *   alertOddsContexts/{alertId}__{marketType} deterministic id (one per alert+market)
 *
 * Notes:
 * - Odds snapshots are immutable point-in-time records (auto id) — never
 *   overwritten. No fabricated odds: only what the provider returns is stored.
 * - rawJson is preserved as provided (string or null).
 * - Date values (capturedAt) are normalized to ISO strings.
 * - Single-equality (fixtureId) query + in-memory sort for listRecentSnapshots.
 */
import { getFirestore } from '../../firebase/admin.js'
import type { OddsRepository, Json } from '../contracts.js'

const SNAPSHOTS = 'oddsSnapshots'
const CONTEXTS = 'alertOddsContexts'

function contextId(alertId: string, marketType: string): string {
  return `${alertId}__${marketType}`.replace(/\//g, '_')
}

function docData(doc: any): Json {
  return { id: doc.id, ...doc.data() }
}

function normalize(input: Json): Json {
  const out: Json = {}
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue
    out[k] = v instanceof Date ? v.toISOString() : v
  }
  return out
}

export class FirebaseOddsRepository implements OddsRepository {
  async createSnapshot(input: Json): Promise<Json> {
    const db = await getFirestore()
    const now = new Date().toISOString()
    const data = {
      ...normalize(input),
      capturedAt: input.capturedAt ? (input.capturedAt instanceof Date ? input.capturedAt.toISOString() : String(input.capturedAt)) : now,
      createdAt: now,
    }
    const ref = await db.collection(SNAPSHOTS).add(data)
    return { id: ref.id, ...data }
  }

  async listRecentSnapshots(fixtureId: string, limit?: number): Promise<Json[]> {
    const db = await getFirestore()
    const snap = await db.collection(SNAPSHOTS).where('fixtureId', '==', fixtureId).get()
    return snap.docs.map(docData)
      .sort((a: Json, b: Json) => (b.capturedAt || '').localeCompare(a.capturedAt || ''))
      .slice(0, limit || 100)
  }

  async findAlertOddsContext(alertId: string, marketType: string): Promise<Json | null> {
    const db = await getFirestore()
    const doc = await db.collection(CONTEXTS).doc(contextId(alertId, marketType)).get()
    return doc.exists ? docData(doc) : null
  }

  async createAlertOddsContext(input: Json): Promise<Json> {
    const db = await getFirestore()
    const id = contextId(input.alertId, input.marketType)
    const data = {
      ...normalize(input),
      createdAt: new Date().toISOString(),
    }
    // Deterministic id → one context per (alert, marketType). merge keeps it idempotent.
    await db.collection(CONTEXTS).doc(id).set(data, { merge: true })
    return { id, ...data }
  }
}
