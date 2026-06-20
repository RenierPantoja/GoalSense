/**
 * Auth session types (Phase B27).
 */
import type { AuthRole, AuthPermission, AuthContextDto } from '@/features/command/intelligence/authTypes'

export type AuthMode = 'local' | 'firebase' | 'disabled' | 'unavailable' | 'dev_bypass' | 'anonymous'

export interface BackendUser {
  userId: string
  email: string | null
  displayName: string | null
  role: AuthRole
  permissions: AuthPermission[]
  authEnabled: boolean
  authMode: string
  isDevBypass: boolean
  rateLimitEnabled: boolean
}

export interface AuthSession {
  loading: boolean
  isAuthenticated: boolean
  authMode: AuthMode
  firebaseConfigured: boolean
  firebaseUser: { uid: string; email: string | null; displayName: string | null } | null
  backendUser: BackendUser | null
  role: AuthRole
  permissions: AuthPermission[]
  error: string | null
}

export interface AuthContextValue {
  session: AuthSession
  /** B26-compatible context projection (so existing `ctx`/`isAdmin` usage keeps working). */
  ctx: AuthContextDto
  loading: boolean
  isAdmin: boolean
  can: (permission: AuthPermission) => boolean
  isAtLeast: (role: AuthRole) => boolean
  refresh: () => Promise<void>
  loginWithEmail: (email: string, password: string) => Promise<{ ok: boolean; error: string | null }>
  loginWithGoogle: () => Promise<{ ok: boolean; error: string | null }>
  logout: () => Promise<void>
}
