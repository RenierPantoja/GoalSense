/**
 * AuthProvider (Phase B27) — Firebase session + backend role wiring.
 * ─────────────────────────────────────────────────────────────────────────────
 * Listens to Firebase id-token changes, caches the ID token IN MEMORY (never
 * localStorage, never logged), registers it with the apiClient token provider,
 * and fetches GET /api/auth/me for role/permissions. Falls back to local-dev
 * owner when Firebase is unconfigured or backend auth is off, so dev never breaks.
 */
import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  onIdTokenChanged, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, signOut, type User,
} from 'firebase/auth'
import { getFirebaseAuth, isFirebaseAuthConfigured } from './firebaseClient'
import { setAuthTokenProvider } from '@/services/authToken'
import { authApi } from '@/services/authApi'
import { LOCAL_OWNER_CONTEXT } from '@/features/command/intelligence/authTypes'
import type { AuthContextDto, AuthPermission, AuthRole } from '@/features/command/intelligence/authTypes'
import type { AuthContextValue, AuthSession, AuthMode, BackendUser } from './authSession.types'

const ROLE_RANK: Record<AuthRole, number> = { viewer: 0, analyst: 1, operator: 2, admin: 3, owner: 4 }

const INITIAL: AuthSession = {
  loading: true, isAuthenticated: false, authMode: 'unavailable', firebaseConfigured: isFirebaseAuthConfigured(),
  firebaseUser: null, backendUser: null, role: 'viewer', permissions: [], error: null,
}

export const AuthCtx = createContext<AuthContextValue | null>(null)

function mapMode(backend: BackendUser | null, firebaseConfigured: boolean): AuthMode {
  if (!backend) return firebaseConfigured ? 'unavailable' : 'disabled'
  if (!backend.authEnabled) return 'local'
  if (backend.authMode === 'firebase') return 'firebase'
  if (backend.authMode === 'dev_bypass') return 'dev_bypass'
  return 'anonymous'
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession>(INITIAL)
  const tokenRef = useRef<string | null>(null)

  // Register the synchronous token provider used by every API client.
  useEffect(() => { setAuthTokenProvider(() => tokenRef.current) }, [])

  const loadBackendUser = useCallback(async (firebaseUser: User | null) => {
    const me = await authApi.getMe()
    setSession(prev => ({
      ...prev,
      loading: false,
      backendUser: me,
      isAuthenticated: !!me?.authEnabled ? !!firebaseUser : true,
      role: (me?.role ?? 'viewer') as AuthRole,
      permissions: (me?.permissions ?? []) as AuthPermission[],
      firebaseUser: firebaseUser ? { uid: firebaseUser.uid, email: firebaseUser.email, displayName: firebaseUser.displayName } : null,
      authMode: mapMode(me, isFirebaseAuthConfigured()),
      error: me ? null : prev.error,
    }))
  }, [])

  useEffect(() => {
    const auth = getFirebaseAuth()
    if (!auth) {
      // No Firebase Auth → rely on backend (/auth/me handles local owner / anonymous).
      tokenRef.current = null
      void loadBackendUser(null)
      return
    }
    const unsub = onIdTokenChanged(auth, async (user) => {
      try {
        tokenRef.current = user ? await user.getIdToken() : null
      } catch {
        tokenRef.current = null
      }
      await loadBackendUser(user)
    })
    return () => unsub()
  }, [loadBackendUser])

  const refresh = useCallback(async () => {
    const auth = getFirebaseAuth()
    const user = auth?.currentUser ?? null
    if (user) { try { tokenRef.current = await user.getIdToken(true) } catch { /* keep */ } }
    await loadBackendUser(user)
  }, [loadBackendUser])

  const loginWithEmail = useCallback(async (email: string, password: string) => {
    const auth = getFirebaseAuth()
    if (!auth) return { ok: false, error: 'Firebase Auth não configurado neste ambiente.' }
    try { await signInWithEmailAndPassword(auth, email, password); return { ok: true, error: null } }
    catch (e: any) { return { ok: false, error: friendlyAuthError(e?.code) } }
  }, [])

  const loginWithGoogle = useCallback(async () => {
    const auth = getFirebaseAuth()
    if (!auth) return { ok: false, error: 'Firebase Auth não configurado neste ambiente.' }
    try { await signInWithPopup(auth, new GoogleAuthProvider()); return { ok: true, error: null } }
    catch (e: any) { return { ok: false, error: friendlyAuthError(e?.code) } }
  }, [])

  const logout = useCallback(async () => {
    const auth = getFirebaseAuth()
    tokenRef.current = null
    if (auth) { try { await signOut(auth) } catch { /* */ } }
    await loadBackendUser(null)
  }, [loadBackendUser])

  const ctx: AuthContextDto = useMemo(() => {
    const b = session.backendUser
    if (!b) return session.firebaseConfigured && session.authMode !== 'local' ? { ...LOCAL_OWNER_CONTEXT, role: 'viewer', permissions: [], source: 'anonymous', authenticated: false, authEnabled: true } : LOCAL_OWNER_CONTEXT
    return {
      authenticated: session.isAuthenticated, authEnabled: b.authEnabled, role: b.role, userId: b.userId,
      email: b.email, displayName: b.displayName, permissions: b.permissions,
      source: (b.authMode as any) === 'local' ? 'local_dev' : (b.authMode as any), requireAdminForDangerous: true,
    }
  }, [session])

  const can = useCallback((permission: AuthPermission) => session.permissions.includes(permission), [session.permissions])
  const isAtLeast = useCallback((role: AuthRole) => (ROLE_RANK[session.role] ?? 0) >= (ROLE_RANK[role] ?? 0), [session.role])

  const value: AuthContextValue = {
    session, ctx, loading: session.loading, isAdmin: session.role === 'admin' || session.role === 'owner',
    can, isAtLeast, refresh, loginWithEmail, loginWithGoogle, logout,
  }
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

function friendlyAuthError(code: string | undefined): string {
  switch (code) {
    case 'auth/invalid-email': return 'E-mail inválido.'
    case 'auth/user-disabled': return 'Usuário desabilitado.'
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential': return 'E-mail ou senha incorretos.'
    case 'auth/too-many-requests': return 'Muitas tentativas. Aguarde alguns instantes.'
    case 'auth/popup-closed-by-user': return 'Login cancelado.'
    default: return 'Não foi possível autenticar.'
  }
}
