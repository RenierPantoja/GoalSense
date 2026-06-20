# Frontend Auth Session + Token Wiring (Phase B27)

Connects the B26 backend auth to the real frontend: Firebase login, session state, Bearer-token
wiring on API calls, and honest 401/403/429 UX. Local mode (backend `ENABLE_AUTH=false`) keeps the
app fully usable as owner. No token is stored in localStorage or logged.

## Modules
- `src/auth/firebaseClient.ts` — SAFE Firebase Auth init (only when all `VITE_FIREBASE_*` present);
  `isFirebaseAuthConfigured()`, `getFirebaseAuth()` (null when unconfigured → no crash).
- `src/auth/AuthProvider.tsx` + `useAuth.ts` + `authSession.types.ts` — listens to
  `onIdTokenChanged`, caches the ID token **in memory**, registers it via
  `setAuthTokenProvider`, calls `GET /api/auth/me`, exposes `{ session, ctx, can, isAdmin,
  isAtLeast, login*, logout, refresh }`.
- `src/services/authToken.ts` — dependency-free token provider + `authHeaders()` (avoids circular
  imports). `src/services/apiClient.ts` — `apiFetch`/`downloadWithAuth` with 401/403/429
  classification; re-exports the token helpers.
- `src/services/authApi.ts` — `getContext()`, `getMe()`, `refreshMe()` (local-owner fallback).
- UI: `LoginCard`/`LoginPage`, `guards.tsx` (`RequireAuth`, `RequirePermission`), `RoleBadge` +
  `UserSessionMenu`, `AuthStates.tsx` (`ApiAccessError`, `PermissionDeniedState`, `RateLimitState`,
  `InlineDenied`).

## Token wiring
`AuthProvider` keeps the current Firebase ID token in a ref and registers
`setAuthTokenProvider(() => tokenRef.current)`. All API clients now inject `authHeaders()`:
`commandBackendClient` (`fetchApi`/`fetchApiStrict`), `alertIntelligenceApi` (reads + CSV export),
`autoEngineApi` (`request()` — now also maps 401/429), and `apiClient.apiFetch`. When there is no
token (local mode / anonymous), no header is sent and behavior is unchanged.

## Session flow
1. App mounts inside `<AuthProvider>` (in `main.tsx`).
2. If Firebase is configured, the provider subscribes to id-token changes and fetches `/api/auth/me`
   with the Bearer token; otherwise it relies on the backend (`/auth/me` returns local-owner when
   `ENABLE_AUTH=false`, anonymous viewer when on without a token).
3. `useAuth()` exposes role/permissions; `ctx` keeps the B26 shape so existing gates keep working.

## UX for 401/403/429
- 401 → "Faça login para executar esta ação."
- 403 (permission) → "Sua função atual não permite esta ação." (shows current role)
- 403 (env gate) → "Recurso protegido por flag de ambiente."
- 429 → "Muitas solicitações. Aguarde alguns segundos."
No stack traces; only safe backend messages are surfaced.

## Where it is wired now
- `UserSessionMenu` + `RoleBadge` in the Auto Engine cockpit header (identity + logout + mode).
- `AutoAlertPolicyPanel`/editor use the real `useAuth` (admin-gated config + auto-create).
- `RequirePermission`/`RequireAuth` available for any sensitive area; reads stay open for viewers.

## Local mode
With `ENABLE_AUTH=false` (or no backend), `useAuth` resolves to owner (`authMode: 'local'`); the
session menu shows "Auth desabilitado neste ambiente. Operando como owner local."

## Roles
Assigned via Firebase custom claims (`role`) — see [`FIREBASE_AUTH_ROLE_SETUP.md`](./FIREBASE_AUTH_ROLE_SETUP.md).
Never set client-side.

## Limitations (honest, remaining)
- Login UI is wired but not mounted as a dedicated route/guarded shell yet — sensitive actions show
  honest states/disabled controls; a full gated layout is a follow-up.
- Token is kept in memory (Firebase SDK manages refresh); a hard reload re-derives it from the SDK.
- Single-tenant; no user management UI, no billing, no MFA. Multi-instance rate limit still per-process.

## Verification
- `npm run check:encoding` ✓ · `npx tsc --noEmit` ✓ · `npx vite build` ✓
- backend `npm run typecheck`/`build` ✓ · `node scripts/smokeAuthSecurity.mjs` ✓
