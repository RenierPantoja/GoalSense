/**
 * Live Validation Session Metrics (Phase B39) — debounced, scoped counters.
 * ─────────────────────────────────────────────────────────────────────────────
 * In-memory per-session accumulator flushed to the repo on an interval (or on
 * demand) to avoid write storms. Increments are non-fatal. Metrics can be rebuilt
 * from record links. Never invents data; absence of a session = no increment.
 */
import { env } from '../../env.js'
import { createRepositories } from '../../repositories/index.js'
import { listSessionLinkedRecordsIndexed } from './liveValidationRecordIndex.service.js'
import type { LiveValidationSessionMetricCounter, MetricKey } from './liveValidationIndex.types.js'

const flag = (v: unknown) => String(v).toLowerCase() === 'true'
export function isMetricsEnabled(): boolean { return flag(env.ENABLE_LIVE_VALIDATION_SESSION_METRICS) }

const ZERO = (): Record<MetricKey, number> => ({
  providerCallsAllowed: 0, providerCallsBlocked: 0, snapshotsWritten: 0, snapshotsSkipped: 0,
  fixtureCapSkipped: 0, guardBlocks: 0, signalsCreated: 0, alertsCreated: 0, opportunitiesCreated: 0,
  policyEvaluations: 0, outcomesResolved: 0, evidenceExactLinks: 0, evidenceInferredLinks: 0,
  unknownOutcomes: 0, notEvaluableOutcomes: 0, pendingOutcomes: 0,
})

// sessionId → pending deltas (bucket=total)
const pending = new Map<string, Record<MetricKey, number>>()
let flushTimer: ReturnType<typeof setInterval> | null = null

export function incrementSessionMetric(validationSessionId: string | null | undefined, metric: MetricKey, amount = 1): void {
  if (!validationSessionId || !isMetricsEnabled()) return
  let acc = pending.get(validationSessionId)
  if (!acc) { acc = ZERO(); pending.set(validationSessionId, acc) }
  acc[metric] += amount
}

function counterId(sessionId: string, bucketKey: string): string { return `lvm_${sessionId}_${bucketKey}` }

async function applyDelta(sessionId: string, delta: Record<MetricKey, number>): Promise<void> {
  const repos = createRepositories()
  const bucketKey = 'total'
  const existing = await repos.intelligence.getLiveValidationSessionMetricCounter(sessionId, bucketKey).catch(() => null)
  const base = existing || ({ id: counterId(sessionId, bucketKey), validationSessionId: sessionId, bucket: 'total', bucketKey, ...ZERO(), updatedAt: '' } as LiveValidationSessionMetricCounter)
  const merged: LiveValidationSessionMetricCounter = { ...base, updatedAt: new Date().toISOString() }
  for (const k of Object.keys(delta) as MetricKey[]) (merged as any)[k] = ((base as any)[k] || 0) + delta[k]
  await repos.intelligence.upsertLiveValidationSessionMetricCounter(merged)
}

export async function flushSessionMetrics(): Promise<void> {
  if (pending.size === 0) return
  const entries = [...pending.entries()]
  pending.clear()
  for (const [sessionId, delta] of entries) {
    try { await applyDelta(sessionId, delta) }
    catch (e: any) { console.warn(`[B39] metrics flush failed (non-fatal): ${String(e?.message || e).slice(0, 60)}`) }
  }
}

export function startSessionMetricsFlush(): void {
  if (!isMetricsEnabled() || flushTimer) return
  flushTimer = setInterval(() => { void flushSessionMetrics().catch(() => {}) }, env.LIVE_VALIDATION_SESSION_METRICS_FLUSH_MS)
  if (typeof (flushTimer as any).unref === 'function') (flushTimer as any).unref()
}
export function stopSessionMetricsFlush(): void { if (flushTimer) { clearInterval(flushTimer); flushTimer = null } }

export async function getSessionMetrics(validationSessionId: string): Promise<LiveValidationSessionMetricCounter | null> {
  await flushSessionMetrics().catch(() => {})
  const repos = createRepositories()
  try { return await repos.intelligence.getLiveValidationSessionMetricCounter(validationSessionId, 'total') } catch { return null }
}

/** Recompute counters from the record-link index (deterministic, no domain change). */
export async function rebuildSessionMetricsFromLinks(validationSessionId: string): Promise<LiveValidationSessionMetricCounter> {
  const links = await listSessionLinkedRecordsIndexed(validationSessionId, 5000)
  const c = ZERO()
  for (const l of links) {
    if (l.recordType === 'snapshot') c.snapshotsWritten++
    else if (l.recordType === 'signal_ledger') c.signalsCreated++
    else if (l.recordType === 'alert') c.alertsCreated++
    else if (l.recordType === 'auto_opportunity') c.opportunitiesCreated++
    else if (l.recordType === 'policy_evaluation') c.policyEvaluations++
    else if (l.recordType === 'outcome') c.outcomesResolved++
    else if (l.recordType === 'evidence_reference') { if (l.attributionStrength === 'exact_session_id') c.evidenceExactLinks++; else c.evidenceInferredLinks++ }
  }
  const counter: LiveValidationSessionMetricCounter = { id: counterId(validationSessionId, 'total'), validationSessionId, bucket: 'total', bucketKey: 'total', ...c, updatedAt: new Date().toISOString() }
  try { const repos = createRepositories(); await repos.intelligence.upsertLiveValidationSessionMetricCounter(counter) } catch { /* non-fatal */ }
  return counter
}
