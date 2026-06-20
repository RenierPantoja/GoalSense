/**
 * Auth middleware (Phase B26) — global onRequest hook that attaches request.auth.
 * ─────────────────────────────────────────────────────────────────────────────
 * Every request gets an AuthContext (anonymous viewer / local-dev owner / real
 * user). Never throws; never logs the token. Registered once in server.ts.
 */
import type { FastifyInstance } from 'fastify'
import { resolveAuthContext } from '../modules/auth/auth.service.js'

export function registerAuthMiddleware(app: FastifyInstance): void {
  app.addHook('onRequest', async (req) => {
    try {
      req.auth = await resolveAuthContext(req.headers as Record<string, any>)
    } catch {
      // Never block a request because auth resolution failed → safe anonymous viewer.
      req.auth = {
        authenticated: false, authEnabled: false,
        user: { userId: 'anonymous', role: 'viewer', email: null, displayName: null },
        permissions: ['read:dashboards', 'read:alerts', 'read:backtests', 'read:opportunities', 'read:learning'],
        source: 'anonymous',
      }
    }
  })
}
