/**
 * Auth permissions & access decisions (Phase B26) — PURE, env-free, smoke-testable.
 * ─────────────────────────────────────────────────────────────────────────────
 * Role→permission map (cumulative), permission checks, and the access decision
 * core used by the guards. No I/O, no env, no token handling here.
 */
import type { AuthRole, AuthPermission, AuthSource } from '../auth.types.js'

const VIEWER: AuthPermission[] = ['read:dashboards', 'read:alerts', 'read:backtests', 'read:opportunities', 'read:learning']
const ANALYST: AuthPermission[] = [...VIEWER, 'run:backtest', 'run:replay', 'export:csv']
const OPERATOR: AuthPermission[] = [...ANALYST, 'run:scan', 'opportunity:action', 'opportunity:feedback', 'promotion:plan', 'promote:alert']
const ADMIN: AuthPermission[] = [...OPERATOR, 'policy:config', 'policy:evaluate', 'learning:rebuild', 'resolve:now', 'export:manage']
const OWNER: AuthPermission[] = [...ADMIN, 'auto:create', 'flags:manage', 'users:manage']

export const ROLE_PERMISSIONS: Record<AuthRole, AuthPermission[]> = {
  viewer: VIEWER, analyst: ANALYST, operator: OPERATOR, admin: ADMIN, owner: OWNER,
}

export const ROLE_RANK: Record<AuthRole, number> = { viewer: 0, analyst: 1, operator: 2, admin: 3, owner: 4 }

export function permissionsFor(role: AuthRole): AuthPermission[] {
  return ROLE_PERMISSIONS[role] ?? VIEWER
}

export function roleHasPermission(role: AuthRole, permission: AuthPermission): boolean {
  return permissionsFor(role).includes(permission)
}

export function roleAtLeast(role: AuthRole, min: AuthRole): boolean {
  return (ROLE_RANK[role] ?? 0) >= (ROLE_RANK[min] ?? 0)
}

const ADMIN_ROLES: AuthRole[] = ['admin', 'owner']

export interface AccessEvalInput {
  authEnabled: boolean
  authenticated: boolean
  role: AuthRole
  requiredPermission: AuthPermission | null
  /** true when there is no env gate OR the env gate passes. */
  envGatePassed: boolean
  dangerous: boolean
  requireAdminForDangerous: boolean
}

/**
 * Pure access decision. Env gate is checked FIRST (env off ⇒ 403 even for owner),
 * then auth presence, then permission, then the admin-for-dangerous rule.
 */
export function evaluateAccess(i: AccessEvalInput): { allowed: boolean; status: 200 | 401 | 403; reason: string | null } {
  if (!i.envGatePassed) return { allowed: false, status: 403, reason: 'env_gate_disabled' }
  if (i.requiredPermission) {
    if (i.authEnabled && !i.authenticated) return { allowed: false, status: 401, reason: 'auth_required' }
    if (!roleHasPermission(i.role, i.requiredPermission)) return { allowed: false, status: 403, reason: 'forbidden_permission' }
  }
  if (i.dangerous && i.requireAdminForDangerous && !ADMIN_ROLES.includes(i.role)) {
    return { allowed: false, status: 403, reason: 'admin_required' }
  }
  return { allowed: true, status: 200, reason: null }
}

export interface ContextResolveInput {
  authEnabled: boolean
  hasValidToken: boolean
  tokenRole: AuthRole | null
  devBypassAllowed: boolean
  devRole: AuthRole
}

/**
 * Pure resolution of (authenticated, role, source) from the inputs the service
 * gathered. Local dev (auth off) → owner so development never breaks. Dev bypass
 * only applies when explicitly allowed AND auth is enabled AND there is no token.
 */
export function resolveContextDecision(i: ContextResolveInput): { authenticated: boolean; role: AuthRole; source: AuthSource } {
  if (i.hasValidToken) return { authenticated: true, role: i.tokenRole ?? 'viewer', source: 'firebase' }
  if (!i.authEnabled) return { authenticated: true, role: 'owner', source: 'local_dev' }
  if (i.devBypassAllowed) return { authenticated: true, role: i.devRole, source: 'dev_bypass' }
  return { authenticated: false, role: 'viewer', source: 'anonymous' }
}
