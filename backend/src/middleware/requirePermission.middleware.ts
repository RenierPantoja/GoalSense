/**
 * requirePermission / requireRole guards (Phase B26).
 * ─────────────────────────────────────────────────────────────────────────────
 * Fastify preHandler factories. Check env gate → auth presence → permission →
 * admin-for-dangerous. Deny with 401/403 and record an audit denial. Env gates
 * are NOT replaced by auth — both must pass.
 */
import type { FastifyReply, FastifyRequest } from 'fastify'
import { evaluateAccess } from '../modules/auth/utils/authPermissions.util.js'
import { isAuthEnabled, requireAdminForDangerous } from '../modules/auth/auth.service.js'
import { recordAdminAudit } from '../modules/audit/adminAudit.service.js'
import type { AuthPermission } from '../modules/auth/auth.types.js'
import type { AccessSpec } from '../modules/auth/routeAccess.policy.js'

export interface GuardOptions extends Partial<AccessSpec> {
  permission: AuthPermission
}

export function requirePermission(spec: GuardOptions) {
  return async function guard(req: FastifyRequest, reply: FastifyReply) {
    const auth = req.auth
    const envGatePassed = spec.envGate ? !!spec.envGate() : true
    const decision = evaluateAccess({
      authEnabled: isAuthEnabled(),
      authenticated: !!auth?.authenticated,
      role: auth?.user.role ?? 'viewer',
      requiredPermission: spec.permission,
      envGatePassed,
      dangerous: !!spec.dangerous,
      requireAdminForDangerous: requireAdminForDangerous(),
    })
    if (!decision.allowed) {
      const msg = decision.reason === 'env_gate_disabled'
        ? `Recurso protegido por flag de ambiente${spec.envGateName ? ` (${spec.envGateName})` : ''}.`
        : decision.reason === 'auth_required'
          ? 'Autenticação necessária.'
          : decision.reason === 'admin_required'
            ? 'Ação disponível apenas para admin/owner.'
            : 'Você não tem permissão para esta ação.'
      await recordAdminAudit({
        auth, action: 'dangerous_route_denied', route: req.url, method: req.method,
        result: 'denied', deniedReason: decision.reason,
        metadata: { requiredPermission: spec.permission, dangerous: !!spec.dangerous },
      })
      return reply.status(decision.status).send({ success: false, error: { message: msg, reason: decision.reason } })
    }
    // allowed → continue
  }
}
