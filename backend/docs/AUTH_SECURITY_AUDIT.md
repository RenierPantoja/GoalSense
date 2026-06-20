# Auth, Admin Guardrails & Security — Audit (Phase B26)

Read-only audit before adding the auth/permission layer. Maps every backend endpoint and
classifies its required access so guards can be applied without breaking local dev (where
`ENABLE_AUTH=false`) and without removing the existing env gates.

## Current state (pre-B26)
- **No auth layer.** `server.ts` registers route modules under `/api`; the only `onRequest` hook
  handles Private-Network-Access CORS. CORS is origin-restricted via `CORS_ORIGIN`.
- Firebase Admin (`firebase/admin.ts`) exposes Firestore only (lazy). No `auth()` accessor yet.
- Sensitive POSTs rely solely on **env gates** (e.g. `ENABLE_AUTO_ENGINE`, `ENABLE_BACKTEST_API`,
  `ENABLE_AUTO_ALERT_POLICY_CONFIG`, `ENABLE_MANUAL_AUTO_OPPORTUNITY_PROMOTION`,
  `ENABLE_PROMOTED_ALERT_MANUAL_RESOLVE`, `ENABLE_AUTO_ENGINE_LEARNING_REBUILD`). No role checks,
  no rate limit, no admin audit, single-user `default`.
- Response helpers in `utils/apiResponse.ts`. No secrets are logged today.

## Roles (B26)
`owner > admin > operator > analyst > viewer` (cumulative permissions).
- **viewer**: read dashboards / alerts / backtests / opportunities / learning.
- **analyst**: + run backtest, run replay, export CSV.
- **operator**: + run auto scan, opportunity action/feedback, promotion plan, promote-to-alert.
- **admin**: + policy config, learning rebuild, resolve-now, policy evaluate, manage export.
- **owner**: + auto-create, manage flags/users (future).

## Endpoint classification
| Route (method) | Access | Env gate (kept) |
|---|---|---|
| `GET /api/health` | public | — |
| `GET …/intelligence/alerts/*` (search/overview/failure) | viewer | — |
| `GET …/intelligence/alerts/export` (CSV) | analyst + `export:csv` | `ENABLE_ALERT_EXPORT` |
| `GET …/intelligence/learning/*` (reads) | viewer | — |
| `POST …/intelligence/learning/rebuild` | admin + `learning:rebuild` | — |
| `GET …/intelligence/backtest/*` (reads) | viewer | — |
| `POST …/intelligence/backtest/run` | analyst + `run:backtest` | `ENABLE_BACKTEST_API` |
| `POST …/intelligence/replay/run` | analyst + `run:replay` | `ENABLE_BACKTEST_API` |
| `GET …/auto-engine/*` (status/opps/runs/calibration/policies/evals) | viewer | — |
| `POST …/auto-engine/scan` | operator + `run:scan` | `ENABLE_AUTO_ENGINE` |
| `POST …/auto-engine/opportunities/:id/actions|feedback|notes` | operator + `opportunity:action` | — |
| `POST …/auto-engine/opportunities/:id/promotion-plan` | operator + `promotion:plan` | — |
| `POST …/auto-engine/opportunities/:id/promote-to-alert` | operator + `promote:alert` | `ENABLE_MANUAL_AUTO_OPPORTUNITY_PROMOTION` |
| `POST …/auto-engine/opportunities/:id/evaluate-auto-alert-policy` | operator + `policy:evaluate` | — |
| `POST …/auto-engine/promoted-alerts/:id/resolve-now` | admin + `resolve:now` | `ENABLE_PROMOTED_ALERT_MANUAL_RESOLVE` |
| `POST …/auto-engine/learning/rebuild` | admin + `learning:rebuild` | `ENABLE_AUTO_ENGINE_LEARNING_REBUILD` |
| `POST/PATCH …/auto-engine/auto-alert-policies` | admin + `policy:config` | `ENABLE_AUTO_ALERT_POLICY_CONFIG` |
| auto-create (inside policy eval) | owner + `auto:create` | full flag set (B25) |

Dangerous (rate-limited): scan, learning rebuild, export CSV, promote-to-alert, policy evaluate,
backtest run, replay run, resolve-now.

## Design decisions
- **Global `onRequest` hook** attaches `request.auth` (AuthContext) to every request. In local mode
  (`ENABLE_AUTH=false`) it is a `local_dev` **owner** so existing dev flows keep working. With
  `ENABLE_AUTH=true` and a valid Firebase ID token → role from custom claim `role` (default viewer);
  no token → anonymous viewer (reads allowed; sensitive routes 401/403). `ALLOW_DEV_AUTH_BYPASS`
  only takes effect when explicitly true.
- **Pure decision core** (`utils/authPermissions.util.ts`): `ROLE_PERMISSIONS`, `roleHasPermission`,
  `evaluateAccess`, `resolveContextDecision` — smoke-testable, env-free.
- **Guards** (`requirePermission`, `requireRole`) are `preHandler`s applied to sensitive routes;
  env gates remain and are checked first (env off ⇒ 403 even for owner). Denials are audited.
- **Rate limit**: in-memory sliding window (`utils/rateLimiter.util.ts`), per process; documented
  limitation for multi-instance. `429` honest. Off unless `ENABLE_RATE_LIMIT=true`.
- **Admin audit** (`modules/audit/*`): records sensitive actions + denials. Never stores tokens or
  secrets. Firebase real, Noop no-throw. Collection `adminAuditTrail`.
- **Ownership**: services start stamping `userId`/`role` when available (auth off ⇒ `local-dev`).

## Invariants
No token/secret is ever logged or persisted. Env gates are preserved (auth does not replace them).
Auto-create stays OFF by default. No Telegram, no odds. Local dev keeps working unchanged. B12–B25
behavior is identical when `ENABLE_AUTH=false`. Firebase persists; Noop no-throw.

## Out of scope (deferred)
Full login UI, user management/billing, multi-instance rate limit (Redis), per-resource ACLs,
refresh-token lifecycle, MFA.
