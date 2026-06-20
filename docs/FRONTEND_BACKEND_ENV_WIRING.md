# Frontend ↔ Backend Env Wiring (Phase B28)

How the frontend points at a local or cloud backend, and how the Bearer token flows.

## Backend URL resolution (frontend)
`commandBackendClient.getBackendUrl()` resolves, first match wins:
1. `localStorage['goalsense_backend_url']` — runtime override (set on the deployed site to point at
   a local/staging backend, no rebuild).
2. `import.meta.env.VITE_COMMAND_BACKEND_URL` — build-time (Vercel env).
If neither is set, API clients return empty/null honestly and the UI keeps using local data; the
`BackendStatusBadge` shows "backend não configurado".

> Note: the env var name in this codebase is `VITE_COMMAND_BACKEND_URL`. (`VITE_BACKEND_URL` is a
> common alias in other docs; use the existing one to avoid a rename.)

## CORS (backend)
Set `CORS_ALLOWED_ORIGINS` to the exact frontend origin(s). The backend allows the `Authorization`
header (B28), so the Bearer token works cross-origin. No wildcard in production.

## Token flow (B27 → B28)
`AuthProvider` caches the Firebase ID token in memory and registers it via `setAuthTokenProvider`.
Every API client (`commandBackendClient`, `alertIntelligenceApi`, `autoEngineApi`, `apiClient`)
injects `authHeaders()` → `Authorization: Bearer <token>` when present; nothing is sent in local
mode. The backend verifies the token (when `ENABLE_AUTH=true`) and maps the `role` custom claim.

## BackendStatusBadge
Polls `GET /api/health` every 60s and shows online/offline/no-backend + app env + auth mode. No
diagnostics or secrets are exposed (diagnostics is a separate admin-only endpoint).

## Vercel env checklist (frontend)
- `VITE_COMMAND_BACKEND_URL` = staging/prod backend URL.
- `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`,
  `VITE_FIREBASE_APP_ID` (+ optional storage/messaging) for login.
These are public client config — never the Admin SDK / service account.

## Switching environments
- Local dev: leave `VITE_COMMAND_BACKEND_URL` unset (or point at `http://localhost:4000`); backend
  `ENABLE_AUTH=false` → owner local.
- Staging/prod: set `VITE_COMMAND_BACKEND_URL` to the cloud backend with `ENABLE_AUTH=true`.

---

## B29 — connecting Vercel to the cloud backend

Once the backend is provisioned (see `backend/docs/BACKEND_CLOUD_STAGING_DEPLOY_EXECUTION.md`), set
`VITE_COMMAND_BACKEND_URL=<cloud BACKEND_URL>` in Vercel (Production + Preview) and redeploy. The
`BackendStatusBadge` should show "online · staging". CORS on the backend must list the exact Vercel
origin in `CORS_ALLOWED_ORIGINS`; the `Authorization` header is already allowed so the Bearer token
flows. Until then, the frontend keeps using the runtime override / local data honestly.

---

## B30 — local operations panel (extension)

The cockpit gains an "Operação Local" segment (`LocalOperationsPanel`) backed by
`/api/system/local-operations/*`. It shows the runtime profile, provider/snapshot budgets, coverage,
workers (pause/resume for admins), and volume risk — so you can run locally without abusing the
provider or exploding Firestore writes. See [`LOCAL_OPERATIONS_PANEL.md`](./LOCAL_OPERATIONS_PANEL.md).
