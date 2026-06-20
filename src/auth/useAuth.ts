/**
 * useAuth (Phase B27) — consume the AuthProvider context.
 * ─────────────────────────────────────────────────────────────────────────────
 * Falls back to a local-owner context when used outside a provider (defensive),
 * so isolated components never crash.
 */
import { useContext } from 'react'
import { AuthCtx } from './AuthProvider'
import { LOCAL_OWNER_CONTEXT } from '@/features/command/intelligence/authTypes'
import type { AuthContextValue } from './authSession.types'

const FALLBACK: AuthContextValue = {
  session: {
    loading: false, isAuthenticated: true, authMode: 'local', firebaseConfigured: false,
    firebaseUser: null, backendUser: null, role: 'owner', permissions: LOCAL_OWNER_CONTEXT.permissions, error: null,
  },
  ctx: LOCAL_OWNER_CONTEXT,
  loading: false,
  isAdmin: true,
  can: () => true,
  isAtLeast: () => true,
  refresh: async () => {},
  loginWithEmail: async () => ({ ok: false, error: 'Auth provider ausente.' }),
  loginWithGoogle: async () => ({ ok: false, error: 'Auth provider ausente.' }),
  logout: async () => {},
}

export function useAuth(): AuthContextValue {
  return useContext(AuthCtx) ?? FALLBACK
}
