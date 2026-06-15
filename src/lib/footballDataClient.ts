/**
 * footballDataClient — shared, throttled access to /api/football-data-matches.
 * ─────────────────────────────────────────────────────────────────────────────
 * football-data.org is heavily rate-limited (free tier). Multiple components
 * (live aggregation, MatchesPage, InspectorPanel) were each calling the proxy
 * independently and on re-renders/polls, producing HTTP 429 storms.
 *
 * This wrapper provides, per query:
 *  - a short in-memory TTL cache (reuses recent responses),
 *  - in-flight de-duplication (concurrent callers share one request),
 *  - graceful 429 handling: back off and serve the last value (or empty),
 *    never retry-storm or throw.
 *
 * No mock data — only real responses are cached; on failure we return the last
 * real response if we have one, otherwise an empty `{ matches: [] }`.
 */

interface CacheEntry { at: number; data: any }

const TTL_MS = 60_000          // reuse a response for 60s
const COOLDOWN_MS = 60_000     // after a 429, pause network calls for 60s

const cache = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<any>>()
let cooldownUntil = 0

function buildUrl(query: string): string {
  if (!query) return '/api/football-data-matches'
  const q = query.startsWith('?') ? query.slice(1) : query
  return `/api/football-data-matches?${q}`
}

/**
 * Fetch football-data matches via the proxy, deduped + cached + 429-safe.
 * @param query e.g. '' (today), 'date=2026-06-16', 'matchId=12345'
 */
export async function fetchFootballDataMatches(query = ''): Promise<any> {
  const key = query || '__today__'
  const now = Date.now()

  const cached = cache.get(key)
  if (cached && now - cached.at < TTL_MS) return cached.data

  const existing = inflight.get(key)
  if (existing) return existing

  // Backing off after a recent 429 — serve stale (any age) or empty.
  if (now < cooldownUntil) return cached?.data ?? { matches: [] }

  const p = (async () => {
    try {
      const res = await fetch(buildUrl(query), { cache: 'no-store' })
      if (res.status === 429) {
        cooldownUntil = Date.now() + COOLDOWN_MS
        return cached?.data ?? { matches: [] }
      }
      if (!res.ok) return cached?.data ?? { matches: [] }
      const data = await res.json()
      cache.set(key, { at: Date.now(), data })
      return data
    } catch {
      return cached?.data ?? { matches: [] }
    } finally {
      inflight.delete(key)
    }
  })()

  inflight.set(key, p)
  return p
}
