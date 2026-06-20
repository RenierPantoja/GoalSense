/**
 * In-memory sliding-window rate limiter (Phase B26) — PURE-ish, smoke-testable.
 * ─────────────────────────────────────────────────────────────────────────────
 * Per-process only (no Redis). Multi-instance deployments would not share counters
 * — documented limitation. Clock is injectable for deterministic tests.
 */
export interface RateHitResult {
  allowed: boolean
  remaining: number
  limit: number
  resetAt: number
  retryAfterMs: number
}

export class RateLimiter {
  private hits = new Map<string, number[]>()
  constructor(private windowMs: number) {}

  /** Record a hit for `key`. Returns whether it is allowed under `max`/window at `now`. */
  hit(key: string, max: number, now: number = Date.now()): RateHitResult {
    const windowStart = now - this.windowMs
    const arr = (this.hits.get(key) ?? []).filter(t => t > windowStart)
    const allowed = arr.length < max
    if (allowed) arr.push(now)
    this.hits.set(key, arr)
    const oldest = arr.length > 0 ? arr[0] : now
    const resetAt = oldest + this.windowMs
    return {
      allowed,
      remaining: Math.max(0, max - arr.length),
      limit: max,
      resetAt,
      retryAfterMs: allowed ? 0 : Math.max(0, resetAt - now),
    }
  }

  /** Drop expired buckets to bound memory (called opportunistically). */
  sweep(now: number = Date.now()): void {
    const windowStart = now - this.windowMs
    for (const [k, arr] of this.hits) {
      const kept = arr.filter(t => t > windowStart)
      if (kept.length === 0) this.hits.delete(k)
      else this.hits.set(k, kept)
    }
  }

  reset(): void { this.hits.clear() }
}
