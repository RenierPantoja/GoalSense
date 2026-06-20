/**
 * authApi (Phase B26→B27) — backend auth context/session reads.
 * ─────────────────────────────────────────────────────────────────────────────
 * Calls the backend's non-secret auth endpoints. When the backend is unreachable
 * or auth is off, callers fall back to local-dev owner. Never stores/logs a token.
 */
import { apiFetch } from './apiClient'
import type { AuthContextDto } from '@/features/command/intelligence/authTypes'
import { LOCAL_OWNER_CONTEXT } from '@/features/command/intelligence/authTypes'
import type { BackendUser } from '@/auth/authSession.types'

export const authApi = {
  /** B26 context projection (role + permissions). Falls back to local owner. */
  async getContext(): Promise<AuthContextDto> {
    const r = await apiFetch<AuthContextDto>('/api/auth/context')
    return r.ok && r.data ? r.data : LOCAL_OWNER_CONTEXT
  },

  /** Richer session info for the frontend. Returns null when no backend. */
  async getMe(): Promise<BackendUser | null> {
    const r = await apiFetch<BackendUser>('/api/auth/me')
    if (r.ok && r.data) return r.data
    // No backend configured → behave as local owner so dev never breaks.
    if (r.reason === 'no_backend') {
      return {
        userId: LOCAL_OWNER_CONTEXT.userId, email: null, displayName: null,
        role: LOCAL_OWNER_CONTEXT.role, permissions: LOCAL_OWNER_CONTEXT.permissions,
        authEnabled: false, authMode: 'local', isDevBypass: false, rateLimitEnabled: false,
      }
    }
    return null
  },

  async refreshMe(): Promise<BackendUser | null> { return this.getMe() },
}
