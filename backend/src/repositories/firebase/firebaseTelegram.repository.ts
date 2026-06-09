/**
 * Firebase Telegram Repository (Phase E2)
 * ─────────────────────────────────────────────────────────────────────────────
 * Firestore implementation of TelegramRepository.
 * Collections:
 *   telegramChannels/{channelId}
 *   signalDeliveries/{alertId}__{channelId}   (deterministic id = idempotency)
 */
import { getFirestore } from '../../firebase/admin.js'
import type { TelegramRepository, Json } from '../contracts.js'

const CHANNELS = 'telegramChannels'
const DELIVERIES = 'signalDeliveries'

function deliveryId(alertId: string, channelId: string): string {
  return `${alertId}__${channelId}`
}

function docData(doc: any): Json {
  return { id: doc.id, ...doc.data() }
}

export class FirebaseTelegramRepository implements TelegramRepository {
  // ─── Channels ──────────────────────────────────────────────────────────

  async listChannels(userId: string): Promise<Json[]> {
    const db = await getFirestore()
    const snap = await db.collection(CHANNELS).where('userId', '==', userId).get()
    return snap.docs.map(docData).sort((a: Json, b: Json) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  }

  async findChannel(id: string, userId: string): Promise<Json | null> {
    const db = await getFirestore()
    const doc = await db.collection(CHANNELS).doc(id).get()
    if (!doc.exists) return null
    const data = docData(doc)
    if (data.userId !== userId) return null
    return data
  }

  async createChannel(input: Json, userId: string): Promise<Json> {
    const db = await getFirestore()
    const now = new Date().toISOString()
    const data = {
      userId,
      name: input.name,
      chatId: input.chatId,
      type: input.type || 'group',
      isActive: input.isActive !== false,
      rulesJson: input.rulesJson || null,
      createdAt: now,
      updatedAt: now,
    }
    const ref = await db.collection(CHANNELS).add(data)
    return { id: ref.id, ...data }
  }

  async deleteChannel(id: string): Promise<void> {
    const db = await getFirestore()
    await db.collection(CHANNELS).doc(id).delete()
  }

  async updateChannelRules(id: string, rulesJson: string): Promise<Json> {
    const db = await getFirestore()
    await db.collection(CHANNELS).doc(id).update({ rulesJson, updatedAt: new Date().toISOString() })
    const doc = await db.collection(CHANNELS).doc(id).get()
    return docData(doc)
  }

  // ─── Deliveries ────────────────────────────────────────────────────────

  async findDelivery(alertId: string, channelId: string, status?: string): Promise<Json | null> {
    const db = await getFirestore()
    const doc = await db.collection(DELIVERIES).doc(deliveryId(alertId, channelId)).get()
    if (!doc.exists) return null
    const data = docData(doc)
    if (status && data.status !== status) return null
    return data
  }

  async listDeliveries(filters: { userId: string; alertId?: string; limit?: number }): Promise<Json[]> {
    const db = await getFirestore()
    let query: any = db.collection(DELIVERIES).where('userId', '==', filters.userId)
    if (filters.alertId) query = db.collection(DELIVERIES).where('userId', '==', filters.userId).where('alertId', '==', filters.alertId)
    const snap = await query.limit(filters.limit || 50).get()
    return snap.docs.map(docData).sort((a: Json, b: Json) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  }

  async createDelivery(input: Json): Promise<Json> {
    const db = await getFirestore()
    const id = deliveryId(input.alertId, input.channelId)
    const now = new Date().toISOString()
    const data = {
      userId: input.userId,
      alertId: input.alertId,
      channelId: input.channelId,
      status: input.status || 'pending',
      provider: input.provider || 'telegram',
      messageText: input.messageText || null,
      errorMessage: input.errorMessage || null,
      sentAt: input.sentAt || null,
      createdAt: now,
    }
    // Deterministic id → idempotent (set replaces, preventing duplicates)
    await db.collection(DELIVERIES).doc(id).set(data, { merge: true })
    return { id, ...data }
  }

  async updateDelivery(id: string, patch: Json): Promise<Json> {
    const db = await getFirestore()
    const clean: Json = {}
    for (const [k, v] of Object.entries(patch)) clean[k] = v === undefined ? null : v
    await db.collection(DELIVERIES).doc(id).set(clean, { merge: true })
    const doc = await db.collection(DELIVERIES).doc(id).get()
    return docData(doc)
  }

  async findRecentDeliveryByChannel(channelId: string, sinceDate: Date): Promise<Json | null> {
    const db = await getFirestore()
    const snap = await db.collection(DELIVERIES)
      .where('channelId', '==', channelId)
      .where('status', '==', 'sent')
      .get()
    const sinceIso = sinceDate.toISOString()
    const recent = snap.docs.map(docData).filter((d: Json) => d.sentAt && d.sentAt >= sinceIso)
    return recent.length > 0 ? recent[0] : null
  }

  async countSentDeliveries(channelId: string, alertIds: string[]): Promise<number> {
    if (alertIds.length === 0) return 0
    const db = await getFirestore()
    const snap = await db.collection(DELIVERIES)
      .where('channelId', '==', channelId)
      .where('status', '==', 'sent')
      .get()
    const idSet = new Set(alertIds)
    return snap.docs.map(docData).filter((d: Json) => idSet.has(d.alertId)).length
  }
}
