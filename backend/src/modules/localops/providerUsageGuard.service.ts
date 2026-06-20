/**
 * Provider Usage Guard (Phase B30) — in-memory per-minute/hour call accounting.
 * ─────────────────────────────────────────────────────────────────────────────
 * Counts provider calls by (provider, operationType), enforces local budgets, and
 * exposes diagnostics. In-memory only (per process). Never breaks the backend —
 * callers decide what to do when blocked. No secrets, no external deps.
 */
import { env } from '../../env.js'
import { evaluateUsageLimit } from './utils/localOps.util.js'

export type ProviderOperation =
  // B30 coarse operations (preserved)
  | 'manual' | 'live_worker' | 'backtest' | 'replay' | 'auto_engine' | 'other'
  // B31 fine-grained operations
  | 'live_fixtures' | 'live_snapshot' | 'fixture_detail' | 'alert_resolution'
  | 'auto_engine_scan' | 'backtest_read' | 'replay_read'

interface Bucket { minuteBucket: number; hourBucket: number; minuteCount: number; hourCount: number; count: number; blockedCount: number; lastCallAt: string | null; lastBlockedAt: string | null }

const buckets = new Map<string, Bucket>()
const key = (p: string, op: ProviderOperation) => `${p}::${op}`

function rollover(b: Bucket, now: number): void {
  const m = Math.floor(now / 60000)
  const h = Math.floor(now / 3600000)
  if (b.minuteBucket !== m) { b.minuteBucket = m; b.minuteCount = 0 }
  if (b.hourBucket !== h) { b.hourBucket = h; b.hourCount = 0 }
}
function ensure(p: string, op: ProviderOperation, now: number): Bucket {
  const k = key(p, op)
  let b = buckets.get(k)
  if (!b) { b = { minuteBucket: Math.floor(now / 60000), hourBucket: Math.floor(now / 3600000), minuteCount: 0, hourCount: 0, count: 0, blockedCount: 0, lastCallAt: null, lastBlockedAt: null }; buckets.set(k, b) }
  else rollover(b, now)
  return b
}

export interface UsageDecision { allowed: boolean; reason: string | null; provider: string; operation: ProviderOperation }

/**
 * Record an INTENT to call a provider. Returns whether it is within budget; when
 * allowed it increments counters, when blocked it increments the blocked counter.
 */
export function recordProviderCall(provider: string, operation: ProviderOperation, now: number = Date.now()): UsageDecision {
  const b = ensure(provider, operation, now)
  const decision = evaluateUsageLimit({
    minuteCount: b.minuteCount, hourCount: b.hourCount,
    maxPerMinute: env.LOCAL_MAX_PROVIDER_CALLS_PER_MINUTE, maxPerHour: env.LOCAL_MAX_PROVIDER_CALLS_PER_HOUR,
  })
  if (decision.allowed) {
    b.minuteCount++; b.hourCount++; b.count++; b.lastCallAt = new Date(now).toISOString()
  } else {
    b.blockedCount++; b.lastBlockedAt = new Date(now).toISOString()
  }
  return { allowed: decision.allowed, reason: decision.reason, provider, operation }
}

export function getProviderUsage() {
  const now = Date.now()
  const records = [...buckets.entries()].map(([k, b]) => {
    rollover(b, now)
    const [provider, operation] = k.split('::')
    return {
      provider, operation,
      minuteBucket: b.minuteBucket, hourBucket: b.hourBucket,
      minuteCount: b.minuteCount, hourCount: b.hourCount,
      count: b.count, blockedCount: b.blockedCount,
      lastCallAt: b.lastCallAt, lastBlockedAt: b.lastBlockedAt,
    }
  })
  return {
    limits: { perMinute: env.LOCAL_MAX_PROVIDER_CALLS_PER_MINUTE, perHour: env.LOCAL_MAX_PROVIDER_CALLS_PER_HOUR },
    records,
    nearLimit: records.some(r => r.hourCount >= env.LOCAL_MAX_PROVIDER_CALLS_PER_HOUR * 0.8),
    generatedAt: new Date().toISOString(),
  }
}

/** Reset in-memory counters (does NOT delete any persisted data). */
export function resetProviderUsageCounters(): void { buckets.clear() }
