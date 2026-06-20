/**
 * Auth routes (Phase B26) — context introspection + admin audit read.
 * ─────────────────────────────────────────────────────────────────────────────
 * GET /auth/context returns the resolved (non-secret) AuthContext so the frontend
 * can adapt permissions. GET /auth/audit is admin-only.
 */
import type { FastifyInstance } from 'fastify'
import { ok } from '../../utils/apiResponse.js'
import { publicAuthContext } from './auth.service.js'
import { requirePermission } from '../../middleware/requirePermission.middleware.js'
import { listAdminAudit } from '../audit/adminAudit.service.js'

function clampLimit(raw: string | undefined, def: number, max: number): number {
  const n = raw ? parseInt(raw, 10) : def
  if (!Number.isFinite(n) || n <= 0) return def
  return Math.min(n, max)
}

export async function authRoutes(app: FastifyInstance) {
  app.get('/auth/context', async (req) => {
    return ok(req.auth ? publicAuthContext(req.auth) : null)
  })

  app.get('/auth/audit', { preHandler: [requirePermission({ permission: 'users:manage', dangerous: true })] }, async (req) => {
    const { limit } = req.query as { limit?: string }
    return ok(await listAdminAudit(clampLimit(limit, 100, 500)))
  })
}
