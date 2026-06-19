/**
 * Alert Intelligence Cache (Phase B18) — tiny in-memory TTL cache for the
 * server-side overview, to avoid recomputing the heavy join on every request.
 * ─────────────────────────────────────────────────────────────────────────────
 * Off by default (ENABLE_ALERT_INTELLIGENCE_CACHE). No external dependency, no
 * invented data: on miss/disabled it recomputes from the real memory. The
 * response always carries cacheHit / generatedAt / ttlSeconds so the UI is honest.
 */
import { env } from '../../env.js'
import { buildAlertOverview, type AlertIntelFilters } from './alertIntelligence.service.js'

interface Entry { value: any; expiresAt: number; generatedAt: string }

const store = new Map<string, Entry>()

function enabled(): boolean { return String(env.ENABLE_ALERT_INTELLIGENCE_CACHE).toLowerCase() === 'true' }
function ttlSeconds(): number { return Math.max(5, env.ALERT_INTELLIGENCE_CACHE_TTL_SECONDS) }
function maxKeys(): number { return Math.max(8, env.ALERT_INTELLIGENCE_CACHE_MAX_KEYS) }

function keyOf(f: AlertIntelFilters): string {
  // Only the dimensions that affect the overview computation.
  return JSON.stringify({
    dateFrom: f.dateFrom || null, dateTo: f.dateTo || null, patternId: f.patternId || null,
    league: f.league || null, team: f.team || null, result: f.result || f.status || null,
    dataQuality: f.dataQuality || null, provider: f.provider || null,
    minConfidence: f.minConfidence ?? null, maxConfidence: f.maxConfidence ?? null,
    minuteWindow: f.minuteWindow || null, failureReason: f.failureReason || null,
    severity: f.severity || null, patternName: f.patternName || null, q: f.q || null,
  })
}

function evictIfNeeded(): void {
  if (store.size <= maxKeys()) return
  // Drop the oldest entries (by expiresAt) until under the cap.
  const sorted = [...store.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt)
  for (const [k] of sorted.slice(0, store.size - maxKeys())) store.delete(k)
}

/** Returns the overview with cache metadata. Recomputes on miss/disabled/error. */
export async function getAlertOverviewCached(filters: AlertIntelFilters): Promise<any> {
  const ttl = ttlSeconds()
  if (!enabled()) {
    const value = await buildAlertOverview(filters)
    return { ...value, cacheHit: false, ttlSeconds: 0 }
  }
  const key = keyOf(filters)
  const now = Date.now()
  const hit = store.get(key)
  if (hit && hit.expiresAt > now) {
    return { ...hit.value, cacheHit: true, generatedAt: hit.generatedAt, ttlSeconds: Math.round((hit.expiresAt - now) / 1000) }
  }
  const value = await buildAlertOverview(filters)
  const generatedAt = new Date().toISOString()
  store.set(key, { value, expiresAt: now + ttl * 1000, generatedAt })
  evictIfNeeded()
  return { ...value, cacheHit: false, generatedAt, ttlSeconds: ttl }
}
