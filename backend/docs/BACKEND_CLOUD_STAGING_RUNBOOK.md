# Backend Cloud Staging — Runbook (Phase B28)

Reproducible steps to deploy and validate the GoalSense backend in staging. Never paste real
secrets here or into git.

## 1. Provision env vars (platform dashboard)
Start from `backend/.env.staging.example`. Required:
- `APP_ENV=staging`, `NODE_ENV=production`, `PORT` (often set by the platform).
- `PERSISTENCE_PROVIDER=firebase` + `FIREBASE_SERVICE_ACCOUNT_BASE64` (`cat sa.json | base64 -w0`).
- `CORS_ALLOWED_ORIGINS=<your frontend origin>` (and `http://localhost:5173` for local testing).
- `ENABLE_AUTH=true`, `ALLOW_DEV_AUTH_BYPASS=false`, `ENABLE_RATE_LIMIT=true`.
- Keep ALL of these OFF: `ENABLE_AUTO_ENGINE*`, `ENABLE_AUTO_ALERT_*`, `ENABLE_ALERT_EXPORT`,
  `ENABLE_BACKTEST_API` (enable individually only when validating), `TELEGRAM_ENABLED`, `ODDS_ENABLED`,
  and all `*_WORKER_ENABLED` / `*_SCHEDULER`.

## 2. Build & run
- Docker: `docker build -t goalsense-backend ./backend && docker run -p 4000:4000 --env-file <secrets> goalsense-backend`.
- Or platform build = `npm ci && npm run build`, start = `npm start` (from `backend/`).

## 3. Configure CORS
Set `CORS_ALLOWED_ORIGINS` to the exact frontend origin(s). The backend allows the `Authorization`
header so the Bearer token works. No wildcard in production.

## 4. Firebase
Use a dedicated service account with least privilege. Provide it via
`FIREBASE_SERVICE_ACCOUNT_BASE64`. Verify `/api/ready` shows `firebase.initialized=true`.

## 5. Validate (smoke)
`BACKEND_URL=https://<staging> node scripts/smokeStagingRuntime.mjs` → expect `[staging-smoke] OK`.
Optionally `AUTH_TOKEN=<firebase id token>` to confirm authed `/api/auth/me`.

## 6. Verify logs
Startup prints a flag summary (no secrets). Confirm no token/Authorization/private-key/service
account appears in logs. `/api/system/diagnostics` (admin) shows workers/flags.

## 7. Frontend wiring
Set `VITE_COMMAND_BACKEND_URL=<staging backend>` in Vercel (or the runtime override
`localStorage['goalsense_backend_url']`). The `BackendStatusBadge` should show "online · staging".

## Rollback
Revert the env change (point the frontend back to the previous backend URL) or redeploy the prior
image/commit. No data migration is involved (Firestore unchanged). Disable any worker you enabled.

## Go / No-Go checklist
GO only when ALL are true; otherwise NO-GO:
- [ ] Firebase credentials present; `/api/ready` = 200 with `firebase.initialized=true`.
- [ ] `CORS_ALLOWED_ORIGINS` matches the frontend; preflight OK; `Authorization` allowed.
- [ ] `ENABLE_AUTH=true` and login works end-to-end (`/api/auth/me` returns the role).
- [ ] No secrets in logs (token/Authorization/private key/service account).
- [ ] Workers OFF unless explicitly validated; schedulers OFF.
- [ ] `ENABLE_AUTO_ALERT_CREATE=false`, `ENABLE_AUTO_ENGINE_TO_ALERTS=false` (auto-create off).
- [ ] `TELEGRAM_ENABLED=false`, `ODDS_ENABLED=false`.
- [ ] `ENABLE_ALERT_EXPORT=false` OR export is auth-protected (it is, via `export:csv` + admin).
- [ ] `scripts/smokeStagingRuntime.mjs` passes.
- [ ] `/api/ready` not degraded on any critical dependency.

---

## B29 — execution status

The runtime was validated against a real running instance (staging profile): `/health`, `/api/ready`
(ready=true), `/api/auth/me`, and all read-only endpoints returned 200; CORS echoed only the allowed
origin; every env-gated dangerous route returned 403; no secret appeared in logs. The only remaining
step is operator-side cloud provisioning + setting Vercel `VITE_COMMAND_BACKEND_URL`. Exact provider
command sets and the full go/no-go are in
[`BACKEND_CLOUD_STAGING_DEPLOY_EXECUTION.md`](./BACKEND_CLOUD_STAGING_DEPLOY_EXECUTION.md).
Validate the cloud instance with `BACKEND_URL=https://… node scripts/smokeStagingRuntime.mjs`.

---

## B30 — local operations (running on your machine)

Until the cloud backend is provisioned, run locally with the safe profile: `LOCAL_RUNTIME_PROFILE=
safe_local`, `ENABLE_LOCAL_OPERATIONS_PANEL=true`, all dangerous flags + workers off. Pre-flight with
`npm run local:safe` (prints flags, warns on dangerous ones); start with `npm start`. The "Operação
Local" panel (cockpit) shows provider/snapshot budgets, coverage, workers (pause/resume), and volume
risk. See [`LOCAL_LIVE_OPERATIONS.md`](./LOCAL_LIVE_OPERATIONS.md).
