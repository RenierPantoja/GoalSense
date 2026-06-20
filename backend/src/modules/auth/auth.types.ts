/**
 * Auth & authorization — canonical types (Phase B26).
 * ─────────────────────────────────────────────────────────────────────────────
 * Minimal, explicit, extensible. Roles are cumulative (owner ⊇ admin ⊇ operator ⊇
 * analyst ⊇ viewer). Permissions are explicit strings. Nothing here logs tokens.
 */
export type AuthRole = 'owner' | 'admin' | 'operator' | 'analyst' | 'viewer'

export type AuthPermission =
  // viewer
  | 'read:dashboards' | 'read:alerts' | 'read:backtests' | 'read:opportunities' | 'read:learning'
  // analyst
  | 'run:backtest' | 'run:replay' | 'export:csv'
  // operator
  | 'run:scan' | 'opportunity:action' | 'opportunity:feedback' | 'promotion:plan' | 'promote:alert'
  // admin
  | 'policy:config' | 'policy:evaluate' | 'learning:rebuild' | 'resolve:now' | 'export:manage'
  // owner
  | 'auto:create' | 'flags:manage' | 'users:manage'

export type AuthSource = 'firebase' | 'local_dev' | 'dev_bypass' | 'anonymous'

export interface AuthUser {
  userId: string
  role: AuthRole
  email: string | null
  displayName: string | null
}

export interface AuthContext {
  authenticated: boolean
  authEnabled: boolean
  user: AuthUser
  permissions: AuthPermission[]
  source: AuthSource
}

export interface RouteAccessPolicy {
  permission: AuthPermission | null
  dangerous: boolean
  envGateName: string | null
}

/** Result of a pure access evaluation. */
export interface AccessDecision {
  allowed: boolean
  status: 200 | 401 | 403 | 429
  reason: string | null
}

// Augment Fastify's request with the resolved auth context.
declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext
  }
}
