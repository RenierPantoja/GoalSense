/**
 * Auth service (Phase B26) — resolve the request AuthContext.
 * ─────────────────────────────────────────────────────────────────────────────
 * Verifies a Firebase ID token when present (and Firebase is configured), else
 * falls back to local-dev owner (auth off) / dev-bypass / anonymous viewer.
 * NEVER logs the token. Token verification failures are swallowed → anonymous.
 */
import { env } from '../../env.js'
import { isFirebaseConfigured } from '../../firebase/admin.js'
import { permissionsFor, resolveContextDecision } from './utils/authPermissions.util.js'
import type { AuthContext, AuthRole } from './auth.types.js'

const flag = (v: unknown) => String(v).toLowerCase() === 'true'

export function isAuthEnabled(): boolean { return flag(env.ENABLE_AUTH) }
export function isDevBypassAllowed(): boolean { return flag(env.ALLOW_DEV_AUTH_BYPASS) }
export function requireAdminForDangerous(): boolean { return flag(env.REQUIRE_ADMIN_FOR_DANGEROUS_ACTIONS) }
function devRole(): AuthRole { return env.DEV_AUTH_ROLE as AuthRole }

const VALID_ROLES: AuthRole[] = ['owner', 'admin', 'operator', 'analyst', 'viewer']
function coerceRole(raw: unknown): AuthRole | null {
  return typeof raw === 'string' && (VALID_ROLES as string[]).includes(raw) ? raw as AuthRole : null
}

function bearer(header: string | undefined): string | null {
  if (!header) return null
  const m = /^Bearer\s+(.+)$/i.exec(header.trim())
  return m ? m[1].trim() : null
}

/** Verify a Firebase ID token. Returns the decoded user or null (never throws). */
async function verifyFirebaseToken(token: string): Promise<{ uid: string; role: AuthRole | null; email: string | null; name: string | null } | null> {
  if (!isFirebaseConfigured()) return null
  try {
    const moduleName = 'firebase-admin'
    const admin: any = await import(moduleName).catch(() => null)
    if (!admin) return null
    const app = admin.default || admin
    const decoded = await app.auth().verifyIdToken(token)
    return {
      uid: decoded.uid,
      role: coerceRole(decoded.role) || coerceRole(decoded.claims?.role),
      email: decoded.email ?? null,
      name: decoded.name ?? null,
    }
  } catch {
    return null // invalid/expired token → treated as anonymous (never logged)
  }
}

export async function resolveAuthContext(headers: Record<string, any>): Promise<AuthContext> {
  const authEnabled = isAuthEnabled()
  const token = bearer(headers['authorization'])
  const decoded = token && authEnabled ? await verifyFirebaseToken(token) : null

  const decision = resolveContextDecision({
    authEnabled,
    hasValidToken: !!decoded,
    tokenRole: decoded?.role ?? null,
    devBypassAllowed: isDevBypassAllowed(),
    devRole: devRole(),
  })

  const userId = decoded?.uid
    ?? (decision.source === 'local_dev' ? 'local-dev' : decision.source === 'dev_bypass' ? 'dev-bypass' : 'anonymous')

  return {
    authenticated: decision.authenticated,
    authEnabled,
    user: { userId, role: decision.role, email: decoded?.email ?? null, displayName: decoded?.name ?? null },
    permissions: permissionsFor(decision.role),
    source: decision.source,
  }
}

/** Safe, non-secret projection of the auth context for the frontend. */
export function publicAuthContext(ctx: AuthContext) {
  return {
    authenticated: ctx.authenticated,
    authEnabled: ctx.authEnabled,
    role: ctx.user.role,
    userId: ctx.user.userId,
    email: ctx.user.email,
    displayName: ctx.user.displayName,
    permissions: ctx.permissions,
    source: ctx.source,
    requireAdminForDangerous: requireAdminForDangerous(),
  }
}
