/**
 * Auth & permissions — frontend types (Phase B26).
 * ─────────────────────────────────────────────────────────────────────────────
 * Mirrors the backend public auth context. When the backend has ENABLE_AUTH=false
 * the resolved role is `owner` (local dev), so the UI stays fully usable.
 */
export type AuthRole = 'owner' | 'admin' | 'operator' | 'analyst' | 'viewer'

export type AuthPermission =
  | 'read:dashboards' | 'read:alerts' | 'read:backtests' | 'read:opportunities' | 'read:learning'
  | 'run:backtest' | 'run:replay' | 'export:csv'
  | 'run:scan' | 'opportunity:action' | 'opportunity:feedback' | 'promotion:plan' | 'promote:alert'
  | 'policy:config' | 'policy:evaluate' | 'learning:rebuild' | 'resolve:now' | 'export:manage'
  | 'auto:create' | 'flags:manage' | 'users:manage'

export type AuthSource = 'firebase' | 'local_dev' | 'dev_bypass' | 'anonymous'

export interface AuthContextDto {
  authenticated: boolean
  authEnabled: boolean
  role: AuthRole
  userId: string
  email: string | null
  displayName: string | null
  permissions: AuthPermission[]
  source: AuthSource
  requireAdminForDangerous: boolean
}

export const ROLE_LABEL: Record<AuthRole, string> = {
  owner: 'Owner', admin: 'Admin', operator: 'Operador', analyst: 'Analista', viewer: 'Visualizador',
}

/** Local-dev fallback when the backend is unreachable or auth is off. */
export const LOCAL_OWNER_CONTEXT: AuthContextDto = {
  authenticated: true, authEnabled: false, role: 'owner', userId: 'local-dev',
  email: null, displayName: null,
  permissions: [
    'read:dashboards', 'read:alerts', 'read:backtests', 'read:opportunities', 'read:learning',
    'run:backtest', 'run:replay', 'export:csv', 'run:scan', 'opportunity:action', 'opportunity:feedback',
    'promotion:plan', 'promote:alert', 'policy:config', 'policy:evaluate', 'learning:rebuild', 'resolve:now',
    'export:manage', 'auto:create', 'flags:manage', 'users:manage',
  ],
  source: 'local_dev', requireAdminForDangerous: true,
}
