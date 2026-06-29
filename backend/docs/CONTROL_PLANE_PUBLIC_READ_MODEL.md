# Control Plane Public Read Model — B66

## Goal
Serve the hosted Vercel control plane from a single **sanitized** Firestore
collection (`controlPlanePublicSummaries`) instead of raw operational collections.

## Write path (worker / backend, Admin SDK only)
`controlPlanePublicReadModel.service.ts`:
- `buildPublicControlPlaneSnapshot()` builds 7 docs: `latestWorkerStatus`,
  `latestLiveSessions`, `latestLeases`, `latestDailyReport`, `latestCausalCases`,
  `latestRecoveryStatus`, `freshness`.
- Each doc is sanitized via `publicControlPlaneAllowlist.ts` (allowlist + denylist).
- `publishPublicControlPlaneSnapshot()` scans every doc with `findForbiddenFields`
  before writing; any doc with a detected leak is **dropped** (never published).
- Throttled by `CONTROL_PLANE_PUBLIC_SNAPSHOT_MIN_INTERVAL_SECONDS` (default 30s);
  `{ force: true }` bypasses throttle (used on worker stop).

## Publish triggers (worker)
- End of each worker tick (throttled).
- Worker stop (forced).
(Post-match/recovery run inside the tick path, so their effects are published on
the next tick/stop.)

## Read path (Vercel, public Web SDK / REST)
`api/_controlPlanePublicReadModel.ts`:
- Reads `controlPlanePublicSummaries` first (preferred).
- `dataMode`: `sanitized_read_model` | `raw_fallback` | `missing_public_summary` | `permission_denied`.
- `publicExposure`: `minimal` | `transitional_raw_read` | `blocked` | `unknown`.
- Empty sanitized model is **not** a failure → `missing_public_summary` ("snapshot not published yet").

## Env flags
- `ENABLE_PUBLIC_CONTROL_PLANE_READ_MODEL` (default `true`)
- `ENABLE_RAW_CONTROL_PLANE_READ_FALLBACK` (default `false`)
- `CONTROL_PLANE_PUBLIC_SNAPSHOT_MIN_INTERVAL_SECONDS` (default `30`)

## Invariants
- Only the Admin SDK writes this collection; client writes denied by rules.
- No raw payloads, secrets, PII, odds, headers, or host identifiers.
