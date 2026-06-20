# Backend Cloud Deploy — Audit (Phase B28)

Read-only audit before standing up a real staging/production backend.

## What blocked a clean cloud deploy (pre-B28)
- **CORS did not allow the `Authorization` header** (`allowedHeaders: ['Content-Type']`) — B27 Bearer
  tokens would be blocked cross-origin. **Fixed** (now allows `Authorization`, origins from
  `CORS_ALLOWED_ORIGINS` ?? `CORS_ORIGIN`, no wildcard).
- Firebase Admin only accepted inline JSON / file path / separate vars — awkward for cloud env vars.
  **Fixed**: added `FIREBASE_SERVICE_ACCOUNT_BASE64` (preferred for a single env var).
- No `/ready` or admin diagnostics endpoint; `/health` only under `/api`. **Fixed**: root `/health`
  + `/api/ready` (+ root `/ready` redirect) + admin `/api/system/diagnostics`.
- No graceful shutdown (SIGTERM/SIGINT). **Fixed**.
- No deploy artifact. **Fixed**: `Dockerfile` + `.dockerignore` (never copies `.env`/service account).
- `APP_ENV` enum lacked `staging`/`local`. **Fixed** (added; existing checks unaffected).

## Required envs (cloud)
`APP_ENV`, `PORT`, `PERSISTENCE_PROVIDER=firebase`, Firebase creds (one of:
`FIREBASE_SERVICE_ACCOUNT_BASE64` | `FIREBASE_SERVICE_ACCOUNT_JSON` |
`FIREBASE_PROJECT_ID`+`FIREBASE_CLIENT_EMAIL`+`FIREBASE_PRIVATE_KEY`), `CORS_ALLOWED_ORIGINS`
(frontend origin), and `ENABLE_AUTH=true` recommended. Optional: `PUBLIC_BACKEND_URL`,
`FRONTEND_ORIGIN`, `BUILD_VERSION`.

## Secrets
The service account JSON is a secret — kept out of git (`.gitignore`: `*-firebase-adminsdk-*.json`,
`.env*`) and out of the image (`.dockerignore`). Never logged; `/health` and diagnostics expose only
a **masked** project id. Private keys accept `\n`-escaped values.

## Workers that MUST stay off in staging/prod (until go/no-go)
`LIVE_WORKER_ENABLED`, `PATTERN_WORKER_ENABLED`, `RESOLUTION_WORKER_ENABLED`,
`ENABLE_LEARNING_AGGREGATION_SCHEDULER`, `ENABLE_AUTO_ENGINE_SCHEDULER`,
`ENABLE_AUTO_ENGINE_LEARNING_SCHEDULER` — all default `false`. Dangerous capabilities
(`ENABLE_AUTO_ENGINE_WRITE`, `ENABLE_AUTO_ALERT_CREATE`, `ENABLE_AUTO_ENGINE_TO_ALERTS`,
`ENABLE_ALERT_EXPORT`, `TELEGRAM_ENABLED`, `ODDS_ENABLED`) default `false`.

## Endpoints to validate post-deploy
`/health`, `/api/health`, `/api/ready`, `/api/auth/me`, `/api/intelligence/auto-engine/status`,
`/api/intelligence/alerts/overview`, `/api/intelligence/backtest/runs`,
`/api/intelligence/auto-engine/auto-alert-policy/overview` — via `scripts/smokeStagingRuntime.mjs`
(read-only, no side effects).

## Staging checklist (summary; full list in the runbook)
Firebase creds set · CORS includes the frontend origin · `ENABLE_AUTH=true` + login works ·
all dangerous flags off · workers off · `/api/ready` returns 200 · staging smoke passes · no secrets
in logs.
