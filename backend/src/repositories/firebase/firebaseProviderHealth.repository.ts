/**
 * Firebase Provider Health Repository (Phase E1 — first Firestore adapter)
 * ─────────────────────────────────────────────────────────────────────────────
 * Proves the Firestore adapter pattern without migrating the whole system.
 * Collection: providerHealth
 */
import { getFirestore } from '../../firebase/admin.js'
import type { ProviderHealthRepository, Json } from '../contracts.js'

const COLLECTION = 'providerHealth'

export class FirebaseProviderHealthRepository implements ProviderHealthRepository {
  async create(input: Json): Promise<Json> {
    const db = await getFirestore()
    const doc = {
      ...input,
      checkedAt: input.checkedAt || new Date().toISOString(),
      createdAt: new Date().toISOString(),
    }
    const ref = await db.collection(COLLECTION).add(doc)
    return { id: ref.id, ...doc }
  }

  async listRecent(filters: { provider?: string; limit?: number }): Promise<Json[]> {
    const db = await getFirestore()
    let query = db.collection(COLLECTION).orderBy('checkedAt', 'desc').limit(filters.limit || 20)
    if (filters.provider) {
      query = db.collection(COLLECTION).where('provider', '==', filters.provider).orderBy('checkedAt', 'desc').limit(filters.limit || 20)
    }
    const snap = await query.get()
    return snap.docs.map((d: any) => ({ id: d.id, ...d.data() }))
  }
}
