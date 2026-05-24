/**
 * GoalSense Cache — central caching layer with TTL, versioning, and namespace.
 * Uses localStorage in MVP. Interface ready for Firebase/Supabase migration.
 */

const CACHE_VERSION = 'v1'
const PREFIX = 'gs_cache_'

export interface CacheEntry<T> {
  value: T
  savedAt: number
  expiresAt: number
  source: string
  version: string
}

// ─── TTL Constants (milliseconds) ────────────────────────────────────────────

export const CACHE_TTL = {
  TEAM_ID: 7 * 24 * 3600_000,
  H2H: 30 * 24 * 3600_000,
  TEAM_FORM: 12 * 3600_000,
  HOME_AWAY_SPLIT: 12 * 3600_000,
  FINISHED_FIXTURE: 30 * 24 * 3600_000,
  INJURIES: 6 * 3600_000,
  SUSPENSIONS: 12 * 3600_000,
  TOPSCORERS: 12 * 3600_000,
  PLAYERS: 24 * 3600_000,
  PREMATCH_BASIC: 6 * 3600_000,
  PREMATCH_ADVANCED: 6 * 3600_000,
  LEAGUE_STANDINGS: 2 * 3600_000,
  KNOWLEDGE_PROFILE: 7 * 24 * 3600_000,
} as const

// ─── Core Functions ──────────────────────────────────────────────────────────

function buildKey(key: string): string {
  return `${PREFIX}${CACHE_VERSION}_${key}`
}

export function getCache<T>(key: string): { value: T; age: number; source: string } | null {
  try {
    const raw = localStorage.getItem(buildKey(key))
    if (!raw) return null
    const entry: CacheEntry<T> = JSON.parse(raw)
    if (entry.version !== CACHE_VERSION) return null
    if (Date.now() > entry.expiresAt) {
      localStorage.removeItem(buildKey(key))
      return null
    }
    return { value: entry.value, age: Date.now() - entry.savedAt, source: entry.source }
  } catch { return null }
}

export function setCache<T>(key: string, value: T, ttl: number, source = 'api'): void {
  try {
    const entry: CacheEntry<T> = { value, savedAt: Date.now(), expiresAt: Date.now() + ttl, source, version: CACHE_VERSION }
    localStorage.setItem(buildKey(key), JSON.stringify(entry))
  } catch { /* storage full — silently fail */ }
}

export async function getOrFetch<T>(key: string, fetcher: () => Promise<T | null>, ttl: number, source = 'api'): Promise<{ value: T; fromCache: boolean; source: string } | null> {
  const cached = getCache<T>(key)
  if (cached) return { value: cached.value, fromCache: true, source: cached.source }

  const value = await fetcher()
  if (value !== null) {
    setCache(key, value, ttl, source)
    return { value, fromCache: false, source }
  }
  return null
}

export function invalidate(key: string): void {
  try { localStorage.removeItem(buildKey(key)) } catch {}
}

export function isExpired(key: string): boolean {
  return getCache(key) === null
}

// ─── Utility ─────────────────────────────────────────────────────────────────

export function formatCacheAge(ms: number): string {
  if (ms < 60_000) return 'agora'
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}min atrás`
  if (ms < 86400_000) return `${Math.floor(ms / 3600_000)}h atrás`
  return `${Math.floor(ms / 86400_000)}d atrás`
}
