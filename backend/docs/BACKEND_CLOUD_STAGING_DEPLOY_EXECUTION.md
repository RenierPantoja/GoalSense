# Backend Cloud Staging — Deploy Execution + Runtime Validation (Phase B29)

This phase executes and validates the runtime. **Provisioning a cloud provider requires account
credentials that live with the operator**, so the actual cloud `BACKEND_URL` must be created by you
using the exact command sets below. The runtime itself was **validated end-to-end against a real
running instance** (locally, staging profile) so the deploy is known-good before it reaches cloud.

## What was validated (real running backend, `APP_ENV=staging`)
Booted `node dist/server.js` with `APP_ENV=staging`, `PERSISTENCE_PROVIDER=prisma` (Noop
intelligence), `ENABLE_RATE_LIMIT=true`, `CORS_ALLOWED_ORIGINS` set, on `PORT=4099`. Startup log
(no secrets):
```
[GoalSense Backend] Running on port 4099 (staging)
[GoalSense Backend] flags: auth=off rateLimit=ON autoEngine=off autoEngineWrite=off
  autoAlertPolicy=off autoAlertCreate=off backtestApi=off alertExport=off telegram=off persistence=prisma
```

`node scripts/smokeStagingRuntime.mjs` (BACKEND_URL=http://localhost:4099) → **OK**:
| Probe | Result |
|---|---|
| `GET /health` | 200 |
| `GET /api/health` | 200 |
| `GET /api/ready` | 200 · `ready=true appEnv=staging persistence=prisma firebaseInit=true` |
| `GET /api/auth/me` | 200 · `authEnabled=false role=owner mode=local` |
| `GET …/auto-engine/status` | 200 |
| `GET …/alerts/overview` | 200 |
| `GET …/backtest/runs` | 200 |
| `GET …/auto-alert-policy/overview` | 200 |
| CORS | `access-control-allow-origin: https://goal-sense.vercel.app` (echoes allowed origin only, **no wildcard**) |

Dangerous-route gating (auth off → local owner; env gates still enforced):
| Route | Status | Reason |
|---|---|---|
| `POST …/auto-engine/scan` | **403** | `ENABLE_AUTO_ENGINE=false` |
| `GET …/alerts/export.csv` | **403** | `ENABLE_ALERT_EXPORT=false` |
| `POST …/auto-engine/auto-alert-policies` | **403** | `ENABLE_AUTO_ALERT_POLICY_CONFIG=false` |
| `POST …/backtest/run` | **403** | `ENABLE_BACKTEST_API=false` |
| `POST …/promoted-alerts/:id/resolve-now` | **403** | `ENABLE_PROMOTED_ALERT_MANUAL_RESOLVE=false` |
| `POST …/auto-engine/learning/rebuild` | **403** | `ENABLE_AUTO_ENGINE_LEARNING_REBUILD=false` |
| `GET /api/system/diagnostics` | 200 | admin-only; local owner allowed (would be 401/403 for a viewer when auth on) |
| `POST /api/intelligence/learning/rebuild` (B13) | 200 | admin-gated, **not** env-gated by design (Noop in prisma mode → no DB writes) |

→ The runtime behaves exactly as specified: liveness/readiness OK, CORS safe, dangerous routes
blocked by env gates even for owner, no secret in logs.

## Deploy target
Provider-agnostic. The repo ships a neutral `backend/Dockerfile` (+ `.dockerignore`) and an
`npm start` path; pick any Node/Docker runtime. Below are exact command sets — run the one for your
provider. Set the env from `backend/.env.staging.example` (NEVER commit real values).

### Option A — Google Cloud Run (Docker)
```
gcloud run deploy goalsense-backend \
  --source ./backend --region <region> --allow-unauthenticated \
  --port 4000 \
  --set-env-vars APP_ENV=staging,NODE_ENV=production,PERSISTENCE_PROVIDER=firebase,\
ENABLE_AUTH=true,ENABLE_RATE_LIMIT=true,CORS_ALLOWED_ORIGINS=https://goal-sense.vercel.app \
  --set-secrets FIREBASE_SERVICE_ACCOUNT_BASE64=goalsense-sa-b64:latest
# BACKEND_URL = the https URL Cloud Run prints.
```

### Option B — Render (Docker or Node)
- New Web Service → repo, root `backend/`, Docker (uses the Dockerfile) or build `npm ci && npm run
  build`, start `npm start`, health check path `/health`.
- Add env vars from `.env.staging.example`; put `FIREBASE_SERVICE_ACCOUNT_BASE64` as a secret.

### Option C — Fly.io
```
cd backend && fly launch --no-deploy --dockerfile Dockerfile
fly secrets set FIREBASE_SERVICE_ACCOUNT_BASE64=<b64> APP_ENV=staging ENABLE_AUTH=true \
  CORS_ALLOWED_ORIGINS=https://goal-sense.vercel.app PERSISTENCE_PROVIDER=firebase
fly deploy
```

### Option D — Railway
- New service from repo, root `backend/`, Dockerfile build; add env vars (secret for the base64 SA);
  expose the generated domain.

### Option E — VPS / Docker
```
docker build -t goalsense-backend ./backend
docker run -d -p 4000:4000 --env-file ./secrets.env --name goalsense-backend goalsense-backend
# Front it with a reverse proxy + TLS; BACKEND_URL = your https domain.
```

## Staging envs (no secret values)
See `backend/.env.staging.example`. Required: `APP_ENV=staging`, `NODE_ENV=production`,
`PERSISTENCE_PROVIDER=firebase`, `FIREBASE_SERVICE_ACCOUNT_BASE64`, `CORS_ALLOWED_ORIGINS`. Recommend
`ENABLE_AUTH=true`, `ENABLE_RATE_LIMIT=true`. Keep OFF: `ENABLE_AUTO_ENGINE*`, `ENABLE_AUTO_ALERT_*`,
`ENABLE_ALERT_EXPORT`, `ENABLE_BACKTEST_API`, `TELEGRAM_ENABLED`, `ODDS_ENABLED`, all workers/schedulers.

## Firebase Admin (cloud)
`cat service-account.json | base64 -w0` → `FIREBASE_SERVICE_ACCOUNT_BASE64`. `/api/ready` must show
`firebase.initialized=true`. Diagnostics shows only a **masked** project id. Never log/commit the SA.

## Frontend (Vercel)
Set `VITE_COMMAND_BACKEND_URL=<cloud BACKEND_URL>` (Production + Preview). Keep `VITE_FIREBASE_*`.
The `BackendStatusBadge` should read "online · staging". Authorization header is allowed by CORS.

## Validate the cloud instance
```
cd backend
BACKEND_URL=https://<cloud-backend> node scripts/smokeStagingRuntime.mjs
# optional: AUTH_TOKEN=<firebase id token> to confirm authed /api/auth/me
```

## GO / NO-GO (status now)
| Criterion | Status |
|---|---|
| Backend builds + local smokes pass | ✅ GO |
| Runtime boots, `/health` `/ready` 200 | ✅ GO (validated on running instance) |
| CORS echoes only allowed origin (no wildcard) | ✅ GO |
| Dangerous routes blocked by env gates | ✅ GO |
| No secrets in logs | ✅ GO |
| Auto-create / Telegram / odds OFF | ✅ GO |
| **Cloud `BACKEND_URL` provisioned** | ⛔ NO-GO until you run a command set above |
| **Vercel `VITE_COMMAND_BACKEND_URL` set to cloud** | ⛔ NO-GO until provisioned |
| **`ENABLE_AUTH=true` + Firebase login validated against cloud** | ⛔ pending cloud (auth verified locally as off→owner; on-path requires the cloud instance + a real token) |

**Overall: runtime is GO; cloud provisioning is the only remaining operator step (NO-GO until done).**

## Next steps (operator)
1. Pick a provider, run its command set with the staging envs.
2. Run `BACKEND_URL=… node scripts/smokeStagingRuntime.mjs` → expect OK.
3. Set Vercel `VITE_COMMAND_BACKEND_URL`; confirm `BackendStatusBadge` online.
4. With `ENABLE_AUTH=true`, log in, confirm `/api/auth/me` returns your role; re-run the dangerous
   route + go/no-go checks against the cloud URL.
