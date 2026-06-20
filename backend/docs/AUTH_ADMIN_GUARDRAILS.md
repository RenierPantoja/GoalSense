# Auth, Admin Guardrails & Security (Phase B26)

The first real security layer: authentication, role-based authorization, route guards, admin
audit trail, and a basic rate limiter — applied to sensitive endpoints without breaking local dev
and without removing the existing env gates. Not billing, not odds, not Telegram, not auto-bet.
Auto-create stays OFF by default.

## Roles & permissions
`owner > admin > operator > analyst > viewer` (cumulative). Permission map lives in
`modules/auth/utils/authPermissions.util.ts` (pure):
- viewer: `read:dashboards|alerts|backtests|opportunities|learning`
- analyst: + `run:backtest`, `run:replay`, `export:csv`
- operator: + `run:scan`, `opportunity:action`, `opportunity:feedback`, `promotion:plan`, `promote:alert`
- admin: + `policy:config`, `policy:evaluate`, `learning:rebuild`, `resolve:now`, `export:manage`
- owner: + `auto:create`, `flags:manage`, `users:manage`

## How a request is authenticated
A global `onRequest` hook (`middleware/auth.middleware.ts`) attaches `request.auth` (AuthContext)
to **every** request via `auth.service.resolveAuthContext`:
- Valid Firebase ID token (Bearer) + Firebase configured → role from custom claim `role`
  (default `viewer` — least privilege). Tokens are verified with `firebase-admin auth()` and are
  **never logged**.
- No/invalid token: `ENABLE_AUTH=false` → `local_dev` **owner** (dev never breaks);
  `ALLOW_DEV_AUTH_BYPASS=true` → `DEV_AUTH_ROLE` (`dev_bypass`); otherwise → anonymous `viewer`.

`GET /api/auth/context` returns the non-secret projection for the frontend. `GET /api/auth/audit`
is `users:manage` only.

## Guards
`middleware/requirePermission.middleware.ts` (`requirePermission(spec)`) is a `preHandler`. Order
(pure core `evaluateAccess`): **env gate → auth presence → permission → admin-for-dangerous**.
- env gate off ⇒ 403 (even for owner) — auth never bypasses env gates.
- auth enabled + unauthenticated + permission required ⇒ 401.
- role lacks permission ⇒ 403.
- dangerous + `REQUIRE_ADMIN_FOR_DANGEROUS_ACTIONS=true` + role < admin ⇒ 403.
Denials are recorded as `dangerous_route_denied` in the admin audit.

`modules/auth/routeAccess.policy.ts` (`ROUTE_ACCESS`) declares each sensitive route's permission,
dangerous flag, and env gate. Applied in `backtest.routes`, `learning.routes`,
`intelligence.routes` (CSV), and `autoEngine.routes`.

## Protected routes (summary)
backtest run / replay run (analyst, `ENABLE_BACKTEST_API`); learning rebuild (admin); CSV export
(analyst, `ENABLE_ALERT_EXPORT`); auto scan (operator, `ENABLE_AUTO_ENGINE`); opportunity
action/feedback/notes (operator); promotion plan (operator); promote-to-alert (operator,
`ENABLE_MANUAL_AUTO_OPPORTUNITY_PROMOTION`); resolve-now (admin,
`ENABLE_PROMOTED_ALERT_MANUAL_RESOLVE`); auto learning rebuild (admin,
`ENABLE_AUTO_ENGINE_LEARNING_REBUILD`); policy create/patch (admin,
`ENABLE_AUTO_ALERT_POLICY_CONFIG`); policy evaluate (operator/admin). Read endpoints stay open when
`ENABLE_AUTH=false`; require auth when `ENABLE_AUTH=true`.

## Rate limit
`middleware/rateLimit.middleware.ts` + pure `utils/rateLimiter.util.ts` — in-memory sliding window,
per process. OFF unless `ENABLE_RATE_LIMIT=true`. Applied to dangerous routes (scan, rebuilds,
export, promote-to-alert, policy evaluate, backtest/replay run, resolve-now). `429` with
`Retry-After`. **Limitation**: counters are not shared across instances (no Redis this phase).

## Admin audit trail
`modules/audit/*` records sensitive actions + denials in `adminAuditTrail` (Firebase real, Noop
no-throw). Fields: id, userId, role, action, resourceType/Id, route, method, result, deniedReason,
metadata, createdAt. The sanitizer drops any key matching `token|secret|password|authorization|
cookie|key` and truncates long strings — **no tokens/secrets are ever stored**.

## Env flags
`ENABLE_AUTH=false` (dev), `ALLOW_DEV_AUTH_BYPASS=false`, `DEV_AUTH_ROLE=owner`,
`REQUIRE_ADMIN_FOR_DANGEROUS_ACTIONS=true`, `ENABLE_RATE_LIMIT=false`, `RATE_LIMIT_WINDOW_MS=60000`,
`RATE_LIMIT_MAX_REQUESTS_DEFAULT=120`, `RATE_LIMIT_MAX_REQUESTS_DANGEROUS=10`. Production should set
`ENABLE_AUTH=true` and keep dev bypass off.

## Ownership / user context
`request.auth.user.userId`/`role` are available to handlers; audit entries are stamped with them.
When auth is off the userId is `local-dev`. Existing records without a userId remain readable
(no migration). Deeper per-resource ownership stamping continues incrementally.

## Smoke
`node scripts/smokeAuthSecurity.mjs` — cumulative permission map, access decisions (401/403/200,
env-gate-first, admin-for-dangerous), context resolution (local owner / anonymous / dev bypass /
token), rate limiter. All pure; no Firebase. Passes.

## Limitations (honest, remaining)
- No login UI / token lifecycle yet (frontend reads context; bearer-token wiring is a future phase).
- Rate limit is per-process (multi-instance needs shared store).
- Single-tenant: roles via Firebase custom claims; no user/plan management or per-resource ACLs.
- Reads remain open when `ENABLE_AUTH=false` (intended for local dev).

## Next steps
Login UI + token attachment on API calls, multi-instance rate limit, per-user ownership filters,
billing/plans, MFA.

---

## B27 — frontend session + `/auth/me` (extension)

A richer `GET /api/auth/me` projection was added (role, permissions, authMode, isDevBypass,
authEnabled, rateLimitEnabled — never a token/secret) for the frontend session. The browser sends
the Firebase ID token as `Authorization: Bearer …` on sensitive calls; the backend verification and
guards are unchanged. Role assignment is via Firebase custom claims — see
[`../../docs/FIREBASE_AUTH_ROLE_SETUP.md`](../../docs/FIREBASE_AUTH_ROLE_SETUP.md).
