/**
 * RequireAuth / RequirePermission (Phase B27).
 * ─────────────────────────────────────────────────────────────────────────────
 * Visual guards. They DO NOT grant access (backend is the authority); they show
 * honest states. Local mode (auth off) passes through so dev never breaks; read-only
 * stays visible for viewers — only sensitive actions are gated.
 */
import type { ReactNode } from 'react'
import { useAuth } from './useAuth'
import { LoginCard } from './LoginCard'
import { PermissionDeniedState } from './AuthStates'
import type { AuthPermission } from '@/features/command/intelligence/authTypes'

/** Requires an authenticated session when backend auth is enabled. */
export function RequireAuth({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return null
  // Auth off (local) or already authenticated → render.
  if (!session.backendUser?.authEnabled || session.isAuthenticated) return <>{children}</>
  return <>{fallback ?? <LoginCard />}</>
}

/** Renders children only when the permission is held; otherwise an honest state/disabled. */
export function RequirePermission({ permission, children, fallback, hideWhenDenied }: { permission: AuthPermission; children: ReactNode; fallback?: ReactNode; hideWhenDenied?: boolean }) {
  const { can, session } = useAuth()
  if (can(permission)) return <>{children}</>
  if (hideWhenDenied) return null
  return <>{fallback ?? <PermissionDeniedState role={session.role} />}</>
}
