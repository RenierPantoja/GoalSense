/**
 * notifiedAlertsStore — local persistence for alert notification dedup and
 * rate limiting (V5.1).
 * ─────────────────────────────────────────────────────────────────────────────
 * Two responsibilities:
 *
 *  1. Dedup: remember which Command Center alert ids already fired a local
 *     notification, so a page reload (or React Strict Mode double mount) does
 *     not replay the same notification stack.
 *
 *  2. Rate limit: throttle notification firing to a maximum of 3 in any
 *     rolling 60s window. If multiple patterns hit at once, the browser does
 *     not turn into spam.
 *
 * Both stores live under the `goalsense_` prefix so `clearAllGoalSense()`
 * already wipes them. Both `safeParse` corrupt data and degrade to "no data"
 * silently — failures here can never break the app.
 */
const NOTIFIED_KEY = 'goalsense_notified_command_alerts'
const RATE_KEY = 'goalsense_notification_rate_limit'

const MAX_TRACKED = 200
const TRACK_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

const RATE_WINDOW_MS = 60_000
const RATE_MAX = 3

type NotifiedMap = Record<string, number>
type RateList = number[]

function safeReadObject<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return fallback
    return parsed as T
  } catch { return fallback }
}

function safeWrite(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* private mode / quota */ }
}

// ─── Dedup ──────────────────────────────────────────────────────────────────

function loadNotified(): NotifiedMap {
  return safeReadObject<NotifiedMap>(NOTIFIED_KEY, {})
}

function saveNotified(map: NotifiedMap): void {
  safeWrite(NOTIFIED_KEY, map)
}

/** True when this alertId was already notified (and is still within TTL). */
export function hasAlertBeenNotified(alertId: string): boolean {
  if (!alertId) return false
  const map = loadNotified()
  const ts = map[alertId]
  if (!ts) return false
  return (Date.now() - ts) < TRACK_TTL_MS
}

/** Record that we just notified this alertId. Caps and TTLs are enforced. */
export function markAlertNotified(alertId: string): void {
  if (!alertId) return
  const map = loadNotified()
  map[alertId] = Date.now()
  saveNotified(pruneNotified(map))
}

function pruneNotified(map: NotifiedMap): NotifiedMap {
  const now = Date.now()
  const entries = Object.entries(map).filter(([, ts]) => (now - ts) < TRACK_TTL_MS)
  // Keep the most recent N when over cap.
  if (entries.length > MAX_TRACKED) {
    entries.sort((a, b) => b[1] - a[1])
    entries.length = MAX_TRACKED
  }
  const next: NotifiedMap = {}
  for (const [id, ts] of entries) next[id] = ts
  return next
}

/** Public maintenance entry. Safe to call on app boot. */
export function cleanupNotifiedAlerts(): void {
  const map = loadNotified()
  const pruned = pruneNotified(map)
  if (Object.keys(pruned).length !== Object.keys(map).length) saveNotified(pruned)
}

// ─── Rate limit ─────────────────────────────────────────────────────────────

function loadRateList(): RateList {
  try {
    const raw = localStorage.getItem(RATE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((v: unknown): v is number => typeof v === 'number')
  } catch { return [] }
}

function saveRateList(list: RateList): void {
  safeWrite(RATE_KEY, list)
}

/** True when firing right now would respect the rate limit. */
export function isWithinRateLimit(): boolean {
  const now = Date.now()
  const recent = loadRateList().filter(ts => (now - ts) < RATE_WINDOW_MS)
  return recent.length < RATE_MAX
}

/** Record a successful fire, pruning entries outside the window. */
export function recordNotificationFire(): void {
  const now = Date.now()
  const recent = loadRateList().filter(ts => (now - ts) < RATE_WINDOW_MS)
  recent.push(now)
  saveRateList(recent)
}


// ─── Diagnostics (V5.2) ─────────────────────────────────────────────────────

/** Configuration constants exposed for the diagnostic UI. */
export const NOTIFICATION_RATE_LIMIT = {
  windowMs: RATE_WINDOW_MS,
  windowSeconds: RATE_WINDOW_MS / 1000,
  max: RATE_MAX,
} as const

export interface NotifiedAlertsStats {
  /** How many alert ids are currently in the dedup map (within TTL). */
  notifiedCount: number
  /** Most recent dedup timestamp, or undefined if none. */
  lastNotifiedAt?: number
  /** Oldest dedup timestamp, or undefined if none. */
  oldestEntryAt?: number
  /** How many fires sit inside the current rolling 60s window. */
  rateWindowCount: number
  /** Maximum allowed fires per window (constant). */
  rateWindowLimit: number
  /** Window length in seconds (constant, for UI copy). */
  rateWindowSeconds: number
}

/**
 * Snapshot of dedup + rate-limit state. Pure read, no side effects. Safe to
 * call from a React render path because it only reads localStorage.
 */
export function getNotifiedAlertsStats(): NotifiedAlertsStats {
  const map = loadNotified()
  const ttlNow = Date.now()
  const liveEntries = Object.values(map).filter(ts => (ttlNow - ts) < TRACK_TTL_MS)
  liveEntries.sort((a, b) => a - b)
  const oldestEntryAt = liveEntries[0]
  const lastNotifiedAt = liveEntries[liveEntries.length - 1]

  const rateNow = Date.now()
  const recent = loadRateList().filter(ts => (rateNow - ts) < RATE_WINDOW_MS)

  return {
    notifiedCount: liveEntries.length,
    lastNotifiedAt,
    oldestEntryAt,
    rateWindowCount: recent.length,
    rateWindowLimit: RATE_MAX,
    rateWindowSeconds: RATE_WINDOW_MS / 1000,
  }
}

/** Wipe the dedup map. Next time the same alert.id flows through the bridge,
 *  it is allowed to notify again. */
export function clearNotifiedAlerts(): void {
  try { localStorage.removeItem(NOTIFIED_KEY) } catch { /* */ }
}

/** Wipe the rate-limit window so the next call passes the gate immediately. */
export function clearNotificationRateLimit(): void {
  try { localStorage.removeItem(RATE_KEY) } catch { /* */ }
}
