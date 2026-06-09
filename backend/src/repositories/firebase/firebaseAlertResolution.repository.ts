/**
 * Firebase Alert Resolution Repository (Phase E3)
 * ─────────────────────────────────────────────────────────────────────────────
 * Firestore implementation of AlertResolutionRepository.
 * Collection: alertResolutions/{alertId}   (deterministic id = alertId)
 *
 * Notes:
 * - Deterministic doc id (= alertId) mirrors the Prisma `@unique` on alertId:
 *   one resolution per alert, no duplicates.
 * - resolveAlert() updates the alert status + writes the resolution atomically
 *   via a Firestore batch (single commit).
 * - resolutionStatus 'unknown' is preserved as a first-class status.
 */
import { getFirestore } from '../../firebase/admin.js'
import type { AlertResolutionRepository, Json } from '../contracts.js'

const COLLECTION = 'alertResolutions'
const ALERTS = 'alerts'

function docData(doc: any): Json {
  return { id: doc.id, ...doc.data() }
}

export class FirebaseAlertResolutionRepository implements AlertResolutionRepository {
  async findByAlertId(alertId: string): Promise<Json | null> {
    const db = await getFirestore()
    const doc = await db.collection(COLLECTION).doc(alertId).get()
    return doc.exists ? docData(doc) : null
  }

  async findByAlertIds(alertIds: string[]): Promise<Json[]> {
    if (alertIds.length === 0) return []
    const db = await getFirestore()
    const docs = await Promise.all(
      alertIds.map((id) => db.collection(COLLECTION).doc(id).get()),
    )
    return docs.filter((d: any) => d.exists).map(docData)
  }

  async create(input: Json): Promise<Json> {
    const db = await getFirestore()
    const alertId = input.alertId
    const now = new Date().toISOString()
    const data = {
      alertId,
      resolutionStatus: input.resolutionStatus,
      resolutionType: input.resolutionType ?? null,
      windowMinutes: input.windowMinutes ?? null,
      evidenceJson: input.evidenceJson ?? '[]',
      resolvedAt: input.resolvedAt ?? now,
      createdAt: now,
    }
    // Deterministic id → one resolution per alert (idempotent on re-write)
    await db.collection(COLLECTION).doc(alertId).set(data, { merge: true })
    return { id: alertId, ...data }
  }

  /** Atomic: update alert.status + create/replace the resolution in one batch. */
  async resolveAlert(alertId: string, status: string, resolution: Json): Promise<Json> {
    const db = await getFirestore()
    const now = new Date().toISOString()
    const resolutionData = {
      alertId,
      resolutionStatus: resolution.resolutionStatus ?? status,
      resolutionType: resolution.resolutionType ?? null,
      windowMinutes: resolution.windowMinutes ?? null,
      evidenceJson: resolution.evidenceJson ?? '[]',
      resolvedAt: resolution.resolvedAt ?? now,
      createdAt: now,
    }

    const batch = db.batch()
    batch.set(db.collection(ALERTS).doc(alertId), { status, updatedAt: now }, { merge: true })
    batch.set(db.collection(COLLECTION).doc(alertId), resolutionData, { merge: true })
    await batch.commit()

    return { id: alertId, ...resolutionData }
  }
}
