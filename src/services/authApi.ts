/**
 * authApi + useAuth (Phase B26) — frontend auth/permission state.
 * ─────────────────────────────────────────────────────────────────────────────
 * Fetches the backend's public auth context. When the backend is unreachable or
 * auth is off, falls back to the local-dev owner so the UI never breaks. Never
 * stores or logs a token (token handling is deferred to a future login phase).
 */
import { useCallback, useEffect, useState } from 'react'
import { getBackendUrl } from './commandBackendClient'
import type { AuthContextDto, AuthPermission, AuthRole } from '@/features/command/intelligence/authTypes'
import { LOCAL_OWNER_CONTEXT } from '@/features/command/intelligence/authTypes'

const ROLE_RANK: Record<AuthRole, number> = { viewer: 0, analyst: 1, operator: 2, admin: 3, owner: 4 }

export const authApi = {
  async getContext(): Promise<AuthContextDto> {
    const base = getBackendUrl()
    if (!base) return LOCAL_OWNER_CONTEXT
    try {
      const res = await fetch(`${base}/api/auth/context`, { headers: { 'Content-Type': 'application/json' } })
      if (!res.ok) return LOCAL_OWNER_CONTEXT
      const json = await res.json()
      return (json?.success && json.data) ? json.data as AuthContextDto : LOCAL_OWNER_CONTEXT
    } catch {
      return LOCAL_OWNER_CONTEXT
    }
  },
}

export interface UseAuthResult {
  ctx: AuthContextDto
  loading: boolean
  refresh: () => Promise<void>
  can: (perm: AuthPermission) => boolean
  isAtLeast: (role: AuthRole) => boolean
  isAdmin: boolean
}

/** Lightweight hook — fetches the auth context once and exposes permission checks. */
export function useAuth(): UseAuthResult {
  const [ctx, setCtx] = useState<AuthContextDto>(LOCAL_OWNER_CONTEXT)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const c = await authApi.getContext()
    setCtx(c)
    setLoading(false)
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const can = useCallback((perm: AuthPermission) => ctx.permissions.includes(perm), [ctx])
  const isAtLeast = useCallback((role: AuthRole) => (ROLE_RANK[ctx.role] ?? 0) >= (ROLE_RANK[role] ?? 0), [ctx])

  return { ctx, loading, refresh, can, isAtLeast, isAdmin: ctx.role === 'admin' || ctx.role === 'owner' }
}
