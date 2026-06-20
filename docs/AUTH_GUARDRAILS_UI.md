# Auth & Guardrails — UI (Phase B26)

Frontend reacts to the backend's resolved permissions. When the backend has `ENABLE_AUTH=false`
(local dev) or is unreachable, the UI falls back to a local-dev **owner** so nothing breaks. No
token is stored or logged (login/token wiring is a future phase).

## Types & hook
- `features/command/intelligence/authTypes.ts`: `AuthRole`, `AuthPermission`, `AuthContextDto`,
  `ROLE_LABEL`, and `LOCAL_OWNER_CONTEXT` (the safe local fallback).
- `services/authApi.ts`: `authApi.getContext()` (calls `GET /api/auth/context`, falls back to
  local owner) and the `useAuth()` hook → `{ ctx, loading, refresh, can(perm), isAtLeast(role),
  isAdmin }`.

## Guard components (`components/views/autoengine/PermissionGate.tsx`)
- `PermissionGate` — renders children only with the permission; otherwise an honest note (or a
  custom fallback). `hideWhenDenied` to fully hide.
- `DangerousActionGuard` — render-prop computing `(allowed, reason)` from permission + env flag +
  admin requirement, so a button can be disabled with an honest tooltip rather than failing on click.
- `AdminOnlyBadge` — "Modo protegido" badge for non-admin users.
- `DeniedNote` / `LocalModeNote` — honest messages: "Você não tem permissão…", "Ação disponível
  apenas para admin.", "Recurso protegido por flag de ambiente.", "Auth desabilitado em modo local…".

## Where it is wired (B26)
The "Políticas" segment (`AutoAlertPolicyPanel`) uses `useAuth`:
- "Nova política" and per-policy edit are disabled unless `policy config flag` AND admin/owner,
  with an honest tooltip; an `AdminOnlyBadge` shows for non-admins.
- The editor receives `createEnabled = ENABLE_AUTO_ALERT_CREATE && isAdmin` (so the
  `auto_create_monitored` mode option is only selectable for admin/owner with the flag on) and
  `configEnabled = configFlag && isAdmin` (save disabled otherwise). The backend still enforces all
  of this — the UI just avoids offering actions it knows will be refused.

Other dangerous actions (scan, backtest run, CSV export, learning rebuild, resolve-now,
promote-to-alert) are already env-gated in their panels; the same `useAuth`/guards can be layered
where those controls live. The backend is always the final authority (guards + audit).

## Honest states
- Backend unreachable / auth off → local owner; everything enabled (local dev).
- Auth on + insufficient role → controls disabled with the reason; reads still work.
- Env flag off → "Recurso protegido por flag de ambiente".

## Verification
- `npm run check:encoding` ✓ · `npx tsc --noEmit` ✓ · `npx vite build` ✓

---

## B27 — real session + token wiring (extension)

The guards now run on a real session (`src/auth/AuthProvider` + `useAuth`): Firebase login,
in-memory ID token, Bearer token on all API clients, and `GET /api/auth/me` for role/permissions.
Honest 401/403/429 components (`AuthStates.tsx`), `RoleBadge`/`UserSessionMenu`, `LoginCard`, and
`RequireAuth`/`RequirePermission` are available. Local mode (auth off) still resolves to owner.
See [`FRONTEND_AUTH_SESSION.md`](./FRONTEND_AUTH_SESSION.md) and
[`FIREBASE_AUTH_ROLE_SETUP.md`](./FIREBASE_AUTH_ROLE_SETUP.md).
