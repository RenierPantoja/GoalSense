# GoalSense Backend — Deploy (Phase B28)

Quick deploy reference. Full details: `docs/BACKEND_CLOUD_RUNTIME_HARDENING.md` and
`docs/BACKEND_CLOUD_STAGING_RUNBOOK.md`.

## Build & run
```
# Docker
docker build -t goalsense-backend ./backend
docker run -p 4000:4000 --env-file ./secrets.env goalsense-backend

# or plain Node
cd backend && npm ci && npm run build && npm start
```
The server listens on `env.PORT` (default 4000), host `0.0.0.0`, and handles SIGTERM/SIGINT.

## Required env (minimum, staging)
```
APP_ENV=staging
PERSISTENCE_PROVIDER=firebase
FIREBASE_SERVICE_ACCOUNT_BASE64=<base64 of service-account.json>
CORS_ALLOWED_ORIGINS=https://your-frontend.example.com
ENABLE_AUTH=true
```
Everything dangerous (auto-engine write, auto-alert create, exports, workers, Telegram, odds) is
OFF by default — see `.env.staging.example`.

## Health
- `GET /health` — liveness (public).
- `GET /api/ready` — readiness (503 if a critical dependency is degraded).
- `GET /api/system/diagnostics` — admin-only operational snapshot (no secrets).

## Validate
```
BACKEND_URL=https://your-backend node scripts/smokeStagingRuntime.mjs
```

## Never
- Commit `.env*` or `*-firebase-adminsdk-*.json` (gitignored + dockerignored).
- Run `npx prisma generate` (use `npm run db:generate` only if the schema changes).
- Enable `ENABLE_AUTO_ALERT_CREATE` / `TELEGRAM_ENABLED` without an explicit go/no-go.
