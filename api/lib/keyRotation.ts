/**
 * API-Football Key Rotation
 *
 * Manages multiple API keys and rotates when one approaches its daily limit.
 * API-Football returns headers:
 *   x-ratelimit-requests-limit: 100
 *   x-ratelimit-requests-remaining: 47
 *
 * Strategy:
 * - Check remaining requests on each call via response headers.
 * - When remaining < threshold (5), mark key as exhausted and switch to next.
 * - If all keys exhausted, use the one with most remaining.
 */

const THRESHOLD = 5 // switch before hitting limit

interface KeyState {
  key: string
  remaining: number
  limit: number
  exhausted: boolean
  lastChecked: number
}

// In-memory state (resets on cold start, which is fine — headers refresh it)
const keyStates: Map<string, KeyState> = new Map()

function getKeys(): string[] {
  // Support both comma-separated KEYS and single KEY
  const multi = process.env.API_FOOTBALL_KEYS
  if (multi) {
    return multi.split(',').map((k) => k.trim()).filter(Boolean)
  }
  const single = process.env.API_FOOTBALL_KEY
  if (single) return [single.trim()]
  return []
}

export function getActiveKey(): string | null {
  const keys = getKeys()
  if (keys.length === 0) return null

  // Initialize states for new keys
  for (const key of keys) {
    if (!keyStates.has(key)) {
      keyStates.set(key, { key, remaining: 100, limit: 100, exhausted: false, lastChecked: 0 })
    }
  }

  // Find first non-exhausted key
  for (const key of keys) {
    const state = keyStates.get(key)!
    if (!state.exhausted) return key
  }

  // All exhausted — reset the one with highest remaining (or least recently checked)
  let best: KeyState | null = null
  for (const state of keyStates.values()) {
    if (!best || state.remaining > best.remaining) {
      best = state
    }
  }

  if (best) {
    best.exhausted = false
    return best.key
  }

  return keys[0]
}

export function updateKeyState(key: string, headers: Headers): void {
  const remaining = parseInt(headers.get('x-ratelimit-requests-remaining') || '', 10)
  const limit = parseInt(headers.get('x-ratelimit-requests-limit') || '', 10)

  if (isNaN(remaining)) return

  const state = keyStates.get(key)
  if (!state) return

  state.remaining = remaining
  state.limit = isNaN(limit) ? 100 : limit
  state.lastChecked = Date.now()

  if (remaining <= THRESHOLD) {
    state.exhausted = true
    console.info(`[key-rotation] Key ...${key.slice(-6)} exhausted (${remaining} remaining). Switching.`)
  }
}

export function markKeyExhausted(key: string): void {
  const state = keyStates.get(key)
  if (state) {
    state.exhausted = true
    state.remaining = 0
    console.info(`[key-rotation] Key ...${key.slice(-6)} marked exhausted (error response).`)
  }
}

export function getKeyStatus(): { total: number; active: string | null; states: Array<{ key: string; remaining: number; exhausted: boolean }> } {
  const keys = getKeys()
  return {
    total: keys.length,
    active: getActiveKey(),
    states: Array.from(keyStates.values()).map((s) => ({
      key: `...${s.key.slice(-6)}`,
      remaining: s.remaining,
      exhausted: s.exhausted,
    })),
  }
}
