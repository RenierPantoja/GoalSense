# Frontend Auth Session + Token Wiring — Audit (Phase B27)

Read-only audit before wiring login/token into the real app.

## Current state
- **Firebase Web SDK present** (`firebase@11`). `src/lib/firebase.ts` already calls
  `initializeApp(firebaseConfig)` + `getAuth(app)` + `getFirestore(app)` from `VITE_FIREBASE_*`
  envs — but **unconditionally** (it throws if the config is empty). No `onAuthStateChanged`
  listener, no login UI, no token usage anywhere.
- **Envs** documented in `VERCEL_ENV_CHECKLIST.md`: `VITE_FIREBASE_API_KEY|AUTH_DOMAIN|PROJECT_ID|
  STORAGE_BUCKET|MESSAGING_SENDER_ID|APP_ID`. Backend URL via `VITE_COMMAND_BACKEND_URL` or
  `localStorage['goalsense_backend_url']` (`commandBackendClient.getBackendUrl()`).
- **App entry**: `src/main.tsx` → `BrowserRouter` → providers (`FavoritesProvider`,
  `ViewModeProvider`) → `App` (`src/app/App.tsx`, react-router routes under `/app`).
- **API clients** all use raw `fetch` with `getBackendUrl()` and NO auth header:
  `commandBackendClient.ts` (`fetchApi`/`fetchApiStrict`), `alertIntelligenceApi.ts` (`get` + CSV
  export fetch), `autoEngineApi.ts` (`request()` with a tagged `ApiResult`, already maps 403→disabled).
- **B26 frontend**: `src/services/authApi.ts` (`authApi.getContext()` + `useAuth()` hook, local-owner
  fallback), `authTypes.ts` (`AuthContextDto`, `LOCAL_OWNER_CONTEXT`), and
  `components/views/autoengine/PermissionGate.tsx` (gates + `AdminOnlyBadge`). `AutoAlertPolicyPanel`
  already consumes `useAuth`.
- **Backend (B26)**: `GET /api/auth/context` (+ new `/api/auth/me`, `/api/auth/audit`); guards via
  `requirePermission`; `request.auth` attached globally; `ENABLE_AUTH=false` ⇒ local-dev owner.

## Plan (non-breaking)
- **Safe Firebase auth client** `src/auth/firebaseClient.ts`: init only when all required envs are
  present; expose `isFirebaseAuthConfigured()` and `getFirebaseAuth()` (null when unconfigured) so
  the app shows an honest "not configured" state instead of crashing. (`src/lib/firebase.ts` stays
  for Firestore; we do NOT change its consumers.)
- **Central token-aware client** `src/services/apiClient.ts`: a module-level token provider
  (`setAuthTokenProvider`) + synchronous `authHeaders()` (reads a cached ID token). `apiFetch` +
  `downloadWithAuth` classify 401/403/429. Existing fetch helpers get `...authHeaders()` injected —
  no signature changes, no behavior change when there is no token (local mode unaffected).
- **AuthProvider** (`src/auth/AuthProvider.tsx` + `useAuth.ts` + `authSession.types.ts`): listens to
  `onIdTokenChanged`, caches the ID token in memory (not localStorage), registers the token provider,
  calls `GET /api/auth/me`, and exposes session + `can()`/`isAdmin`/`login`/`logout`. When Firebase
  is unconfigured or auth is off, it resolves to local-dev owner (dev never breaks).
- **Login UI** (`LoginPage`/`LoginCard`): email/password + Google (only if configured); honest
  "not configured"/"local mode" states. No admin/claims set client-side.
- **Guards** (`RequireAuth`, `RequirePermission`) + **session menu/role badge** + standardized
  **401/403/429** components. Repoint `AutoAlertPolicyPanel`'s `useAuth` to the provider hook.

## Invariants
No token is logged or stored in localStorage (kept in memory / Firebase SDK). No Admin SDK or
service account on the client. Reads stay open when auth is off. B12–B26 behavior unchanged in
local mode. Build must stay green.

## Out of scope
User management UI, billing, MFA, multi-tenant org switching, refresh-token persistence beyond the
Firebase SDK's own handling.
