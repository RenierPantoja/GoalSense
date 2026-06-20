/**
 * Rate limit middleware (Phase B26) — in-memory, per-process.
 * ─────────────────────────────────────────────────────────────────────────────
 * OFF unless ENABLE_RATE_LIMIT=true. Keyed by userId (or IP) + route key. Returns
 * 429 with Retry-After. Multi-instance deployments do not share counters (documented).
 */
import type { FastifyReply, FastifyRequest } from 'fastify'
import { env } from '../env.js'
import { RateLimiter } from '../modules/auth/utils/rateLimiter.util.js'

const flag = (v: unknown) => String(v).toLowerCase() === 'true'
const limiter = new RateLimiter(env.RATE_LIMIT_WINDOW_MS)
let sweeps = 0

export interface RateLimitOptions {
  key: string
  /** 'default' or 'dangerous' bucket size; or an explicit number. */
  max?: number | 'default' | 'dangerous'
}

export function rateLimit(opts: RateLimitOptions) {
  return async function guard(req: FastifyRequest, reply: FastifyReply) {
    if (!flag(env.ENABLE_RATE_LIMIT)) return
    const max = typeof opts.max === 'number'
      ? opts.max
      : opts.max === 'dangerous' ? env.RATE_LIMIT_MAX_REQUESTS_DANGEROUS : env.RATE_LIMIT_MAX_REQUESTS_DEFAULT
    const who = req.auth?.user.userId && req.auth.user.userId !== 'anonymous' ? req.auth.user.userId : (req.ip || 'unknown')
    const key = `${who}:${opts.key}`
    const res = limiter.hit(key, max)
    if (++sweeps % 200 === 0) limiter.sweep()
    if (!res.allowed) {
      reply.header('Retry-After', Math.ceil(res.retryAfterMs / 1000))
      return reply.status(429).send({ success: false, error: { message: 'Limite de requisições atingido. Tente novamente em instantes.', reason: 'rate_limited', retryAfterMs: res.retryAfterMs } })
    }
  }
}
