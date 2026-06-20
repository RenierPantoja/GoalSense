# Backend Cloud Runtime Hardening (Phase B28)

Makes the backend deployable to a real cloud/staging environment with safe secrets, health/ready
probes, correct CORS, controlled workers, secure logs, and graceful shutdown. No behavior change to
the engine — only operational readiness. Auto-create stays OFF; no odds/Telegram.

## Environments
`APP_ENV ∈ local | development | staging | production | test`; `NODE_ENV ∈ development | production |
test`. Schedulers never run when `APP_ENV=test`. Staging/production keep every dangerous flag off by
default (see `.env.staging.example`).

## Firebase Admin (cloud-safe)
`firebase/admin.ts` resolves credentials from (in order): `FIREBASE_SERVICE_ACCOUNT_BASE64` →
`FIREBASE_SERVICE_ACCOUNT_JSON` → `FIREBASE_SERVICE_ACCOUNT_PATH` →
`FIREBASE_PROJECT_ID`+`FIREBASE_CLIENT_EMAIL`+`FIREBASE_PRIVATE_KEY`. Private keys accept `\n`
escapes. Nothing secret is logged; `getFirebaseDiagnostics()` exposes only a **masked** project id.
`getFirebaseReadiness()` powers `/ready` (init check, no query, no secret).

## Health / readiness / diagnostics
- `GET /health` (root) and `GET /api/health` — liveness; appEnv + uptime + masked Firebase info.
- `GET /api/ready` (+ root `/ready` redirect) — readiness; **503** when a critical dependency is
  degraded (Firebase not initialized in firebase mode). Reports persistence, firebase init,
  authEnabled, and critical flags.
- `GET /api/system/diagnostics` — **admin/owner only** (`flags:manage`, dangerous). Non-secret
  snapshot: appEnv, nodeEnv, buildVersion, persistence, masked Firebase project, CORS origins,
  feature flags, worker/scheduler status, uptime.

## CORS
Origins from `CORS_ALLOWED_ORIGINS` (preferred, comma-separated) else `CORS_ORIGIN`. Methods
GET/POST/PATCH/DELETE/OPTIONS. **`allowedHeaders` now includes `Authorization`** so the Vercel
frontend can send the Bearer token. No wildcard origin in production.

## Startup & shutdown
`server.ts` logs a non-secret flag summary on boot, starts each worker/scheduler behind its own env
flag (a failing worker never breaks startup), listens on `env.PORT` (host `0.0.0.0`), and handles
`SIGTERM`/`SIGINT` with a graceful `app.close()` (in-flight requests finish; idempotent).

## Workers / schedulers matrix (cost/risk)
| Worker | Flag | Cost/risk | Default |
|---|---|---|---|
| Live monitor | `LIVE_WORKER_ENABLED` | polls providers (API cost) | off |
| Pattern eval | `PATTERN_WORKER_ENABLED` | CPU + may create alerts | off |
| Alert resolution | `RESOLUTION_WORKER_ENABLED` | resolves alerts (incl. promoted) | off |
| Learning scheduler | `ENABLE_LEARNING_AGGREGATION_SCHEDULER` | periodic aggregation | off |
| Auto engine scheduler | `ENABLE_AUTO_ENGINE_SCHEDULER` | live scans | off |
| Auto engine learning scheduler | `ENABLE_AUTO_ENGINE_LEARNING_SCHEDULER` | calibration recompute | off |

Enable one at a time in staging, validate, then go/no-go for production.

## Logging
No token / `Authorization` / cookie / Firebase private key / service account is ever logged (auth
verification swallows token errors; the audit sanitizer drops secret-like keys). Startup logs are
flag summaries only.

## Deploy artifact
`backend/Dockerfile` (multi-stage: `npm ci` → `npm run build` → slim runtime `node dist/server.js`,
`npm ci --omit=dev`, container `HEALTHCHECK` on `/health`). `backend/.dockerignore` excludes `.env*`,
service-account JSONs, `dist`, `docs`, `.git`. Alternative: platform build = `npm ci && npm run
build`, start = `npm start`. Never run `npx prisma generate` (use `npm run db:generate` only if the
Prisma schema changes — not expected here).

## Smoke
`BACKEND_URL=https://… node scripts/smokeStagingRuntime.mjs` — read-only probes of health/ready/
auth-me + read endpoints + CORS header. No scans, exports, rebuilds, alerts, or Telegram.

## Limitations (honest, remaining)
- No provider pinned (Docker or `npm start` both supported); CI/CD pipeline not included.
- Rate limit remains per-process (no shared store).
- Application Default Credentials not auto-wired (base64/JSON/separate vars cover cloud env vars).
- Readiness checks init, not a full Firestore round-trip (to avoid read cost on every probe).

---

## B30 — local guardrails (extension)

For local operation, B30 adds provider-usage + snapshot-write guards, a runtime profile, a worker
registry (runtime pause/resume), coverage monitoring, and a volume-risk estimate, exposed under
`/api/system/local-operations/*` (env-gated by `ENABLE_LOCAL_OPERATIONS_PANEL`). These control cost
and provider abuse on a single machine without changing engine behavior. See
[`LOCAL_LIVE_OPERATIONS.md`](./LOCAL_LIVE_OPERATIONS.md).
