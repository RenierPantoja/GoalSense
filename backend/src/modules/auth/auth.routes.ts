/**
 * Auth routes (Phase B26) — context introspection + admin audit read.
 * ─────────────────────────────────────────────────────────────────────────────
 * GET /auth/context returns the resolved (non-secret) AuthContext so the frontend
 * can adapt permissions. GET /auth/audit is admin-only.
 */
import type { FastifyInstance } from 'fastify'
import { ok } from '../../utils/apiResponse.js'
import { publicAuthContext } from './auth.service.js'
import { env } from '../../env.js'
import { requirePermission } from '../../middleware/requirePermission.middleware.js'
import { listAdminAudit } from '../audit/adminAudit.service.js'

function clampLimit(raw: string | undefined, def: number, max: number): number {
  const n = raw ? parseInt(raw, 10) : def
  if (!Number.isFinite(n) || n <= 0) return def
  return Math.min(n, max)
}

const flag = (v: unknown) => String(v).toLowerCase() === 'true'

export async function authRoutes(app: FastifyInstance) {
  app.get('/auth/context', async (req) => {
    return ok(req.auth ? publicAuthContext(req.auth) : null)
  })

  // Richer session projection for the frontend (no token, no secret).
  app.get('/auth/me', async (req) => {
    if (!req.auth) return ok(null)
    const base = publicAuthContext(req.auth)
    return ok({
      ...base,
      authMode: base.source === 'local_dev' ? 'local' : base.source === 'firebase' ? 'firebase' : base.source === 'dev_bypass' ? 'dev_bypass' : 'anonymous',
      isDevBypass: base.source === 'dev_bypass',
      rateLimitEnabled: flag(env.ENABLE_RATE_LIMIT),
    })
  })

  app.get('/auth/audit', { preHandler: [requirePermission({ permission: 'users:manage', dangerous: true })] }, async (req) => {
    const { limit } = req.query as { limit?: string }
    return ok(await listAdminAudit(clampLimit(limit, 100, 500)))
  })
}
