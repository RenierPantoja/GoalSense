/**
 * Firebase Performance Repository (Phase E6.2)
 * ─────────────────────────────────────────────────────────────────────────────
 * Incremental, idempotent performance counters per pattern.
 *
 * Collections:
 *   patternPerformanceCounters/{patternId}     — denormalized counts + rates + breakdown maps
 *   performanceCounterProcessed/{alertId}       — idempotency markers { createdApplied, resolvedApplied }
 *
 * Source of truth remains AlertResolution; counters are DERIVATIVE. A rebuild
 * recomputes from raw to correct drift.
 *
 * Idempotency: each alert contributes to the counter AT MOST ONCE per phase
 * ('created' and 'resolved'), enforced inside a Firestore transaction via the
 * processed-marker doc. No metric can be inflated.
 *
 * Honesty rules (identical to on-demand):
 *   - resolvedAlerts = confirmed + confirmedPartial + failed (excludes unknown/expired)
 *   - useful = confirmed + confirmedPartial
 *   - rates only when resolvedAlerts >= 5 (unknownRate uses totalAlerts >= 5); else null
 *   - unknown is a separate bucket, NEVER folded into failed
 */
import { getFirestore } from '../../firebase/admin.js'
import type { PerformanceRepository, Json } from '../contracts.js'

const COUNTERS = 'patternPerformanceCounters'
const PROCESSED = 'performanceCounterProcessed'
const MIN_SAMPLE_FOR_RATE = 5
const READ_CAP = 2000

const TERMINAL = new Set(['confirmed', 'confirmed_partial', 'failed', 'unknown', 'expired'])

function emptyCounter(patternId: string, userId: string): Json {
  const now = new Date().toISOString()
  return {
    patternId, userId,
    totalAlerts: 0, resolvedAlerts: 0,
    confirmed: 0, confirmedPartial: 0, failed: 0, unknown: 0, expired: 0, useful: 0,
    sumConfidence: 0,
    usefulRate: null, failedRate: null, unknownRate: null, confirmedRate: null,
    byMomentumSource: {}, byDataQuality: {}, byProvider: {}, byResolutionType: {},
    createdAt: now, lastUpdatedAt: now,
  }
}

/** Recompute rates from raw counts. Mirrors performance.service.calculateRates. */
function recomputeRates(c: Json): void {
  const resolved = (c.confirmed || 0) + (c.confirmedPartial || 0) + (c.failed || 0)
  c.resolvedAlerts = resolved
  c.useful = (c.confirmed || 0) + (c.confirmedPartial || 0)
  c.confirmedRate = resolved >= MIN_SAMPLE_FOR_RATE ? c.confirmed / resolved : null
  c.usefulRate = resolved >= MIN_SAMPLE_FOR_RATE ? c.useful / resolved : null
  c.failedRate = resolved >= MIN_SAMPLE_FOR_RATE ? c.failed / resolved : null
  c.unknownRate = (c.totalAlerts || 0) >= MIN_SAMPLE_FOR_RATE ? c.unknown / c.totalAlerts : null
}

function inc(map: Record<string, number>, key: string): void {
  if (!key) return
  map[key] = (map[key] || 0) + 1
}

export class FirebasePerformanceRepository implements PerformanceRepository {
  async getPatternCounter(patternId: string, userId: string): Promise<Json | null> {
    const db = await getFirestore()
    const doc = await db.collection(COUNTERS).doc(patternId).get()
    if (!doc.exists) return null
    const data = { id: doc.id, ...doc.data() } as Json
    if (data.userId && data.userId !== userId) return null
    return data
  }

  async listPatternCounters(userId: string): Promise<Json[]> {
    const db = await getFirestore()
    const snap = await db.collection(COUNTERS).where('userId', '==', userId).get()
    return snap.docs.map((d: any) => ({ id: d.id, ...d.data() }))
  }

  async hasProcessedAlert(alertId: string, phase: 'created' | 'resolved'): Promise<boolean> {
    const db = await getFirestore()
    const doc = await db.collection(PROCESSED).doc(alertId).get()
    if (!doc.exists) return false
    const data = doc.data() as any
    return phase === 'created' ? !!data.createdApplied : !!data.resolvedApplied
  }

  async onAlertCreated(input: { alertId: string; patternId: string; userId: string; confidence: number; momentumSource: string; dataQuality: string; provider: string }): Promise<{ applied: boolean; reason?: string }> {
    const db = await getFirestore()
    const counterRef = db.collection(COUNTERS).doc(input.patternId)
    const markerRef = db.collection(PROCESSED).doc(input.alertId)

    return db.runTransaction(async (tx: any) => {
      const markerSnap = await tx.get(markerRef)
      if (markerSnap.exists && markerSnap.data()?.createdApplied) {
        return { applied: false, reason: 'already_created' }
      }
      const counterSnap = await tx.get(counterRef)
      const c: Json = counterSnap.exists ? { ...counterSnap.data() } : emptyCounter(input.patternId, input.userId)

      c.totalAlerts = (c.totalAlerts || 0) + 1
      c.sumConfidence = (c.sumConfidence || 0) + (input.confidence || 0)
      c.byMomentumSource = c.byMomentumSource || {}
      c.byDataQuality = c.byDataQuality || {}
      c.byProvider = c.byProvider || {}
      inc(c.byMomentumSource, input.momentumSource)
      inc(c.byDataQuality, input.dataQuality)
      inc(c.byProvider, input.provider)
      recomputeRates(c)
      c.lastUpdatedAt = new Date().toISOString()

      tx.set(counterRef, c, { merge: true })
      tx.set(markerRef, {
        alertId: input.alertId, patternId: input.patternId,
        createdApplied: true, createdAt: markerSnap.exists ? markerSnap.data()?.createdAt : new Date().toISOString(),
        appliedAt: new Date().toISOString(),
      }, { merge: true })
      return { applied: true }
    })
  }

  async applyResolutionToCounters(input: { alertId: string; patternId: string; userId: string; resolutionStatus: string; resolutionType: string | null }): Promise<{ applied: boolean; reason?: string }> {
    if (!TERMINAL.has(input.resolutionStatus)) {
      return { applied: false, reason: `non_terminal_status:${input.resolutionStatus}` }
    }
    const db = await getFirestore()
    const counterRef = db.collection(COUNTERS).doc(input.patternId)
    const markerRef = db.collection(PROCESSED).doc(input.alertId)

    return db.runTransaction(async (tx: any) => {
      const markerSnap = await tx.get(markerRef)
      if (markerSnap.exists && markerSnap.data()?.resolvedApplied) {
        return { applied: false, reason: 'already_resolved' }
      }
      const counterSnap = await tx.get(counterRef)
      const c: Json = counterSnap.exists ? { ...counterSnap.data() } : emptyCounter(input.patternId, input.userId)

      switch (input.resolutionStatus) {
        case 'confirmed': c.confirmed = (c.confirmed || 0) + 1; break
        case 'confirmed_partial': c.confirmedPartial = (c.confirmedPartial || 0) + 1; break
        case 'failed': c.failed = (c.failed || 0) + 1; break
        case 'unknown': c.unknown = (c.unknown || 0) + 1; break
        case 'expired': c.expired = (c.expired || 0) + 1; break
      }
      c.byResolutionType = c.byResolutionType || {}
      inc(c.byResolutionType, input.resolutionType || input.resolutionStatus)
      recomputeRates(c)
      c.lastUpdatedAt = new Date().toISOString()

      tx.set(counterRef, c, { merge: true })
      tx.set(markerRef, {
        alertId: input.alertId, patternId: input.patternId,
        resolvedApplied: true, resolutionStatus: input.resolutionStatus,
        appliedAt: new Date().toISOString(),
      }, { merge: true })
      return { applied: true }
    })
  }

  async rebuildPatternCounters(patternId: string, userId: string): Promise<Json | null> {
    const db = await getFirestore()
    // Recompute from raw alerts + resolutions (reuses the alert/resolution collections).
    const alertsSnap = await db.collection('alerts').where('patternId', '==', patternId).get()
    const alerts = alertsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })).filter((a: any) => a.userId === userId).slice(0, READ_CAP)

    const c = emptyCounter(patternId, userId)
    const { extractBreakdownKeys, safeParseJson } = await import('../../modules/performance/performanceInputAdapter.js')

    for (const a of alerts) {
      c.totalAlerts += 1
      c.sumConfidence += typeof a.confidence === 'number' ? a.confidence : 0
      const keys = extractBreakdownKeys(a)
      inc(c.byMomentumSource, keys.momentumSource)
      inc(c.byDataQuality, keys.dataQuality)
      inc(c.byProvider, keys.provider)
    }

    // Resolutions (terminal buckets + byResolutionType)
    const resSnap = await db.collection('alertResolutions').get()
    const alertIdSet = new Set(alerts.map((a: any) => a.id))
    for (const d of resSnap.docs) {
      const r: any = { id: d.id, ...d.data() }
      if (!alertIdSet.has(r.alertId)) continue
      const status = r.resolutionStatus
      switch (status) {
        case 'confirmed': c.confirmed += 1; break
        case 'confirmed_partial': c.confirmedPartial += 1; break
        case 'failed': c.failed += 1; break
        case 'unknown': c.unknown += 1; break
        case 'expired': c.expired += 1; break
        default: continue
      }
      inc(c.byResolutionType, r.resolutionType || status)
    }
    recomputeRates(c)
    c.lastUpdatedAt = new Date().toISOString()

    await db.collection(COUNTERS).doc(patternId).set(c, { merge: false })

    // Re-mark processed for consistency (created for all alerts; resolved where a resolution exists).
    const resolvedIds = new Set(resSnap.docs.map((d: any) => (d.data() as any).alertId))
    let batch = db.batch()
    let n = 0
    for (const a of alerts) {
      batch.set(db.collection(PROCESSED).doc(a.id), {
        alertId: a.id, patternId, createdApplied: true,
        resolvedApplied: resolvedIds.has(a.id), appliedAt: new Date().toISOString(),
      }, { merge: true })
      if (++n % 400 === 0) { await batch.commit(); batch = db.batch() }
    }
    if (n % 400 !== 0) await batch.commit()
    void safeParseJson

    return { id: patternId, ...c }
  }
}
