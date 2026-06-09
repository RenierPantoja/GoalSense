# Firebase Patterns + Alerts Migration (Phase E3)

Phase E3 adds Firestore adapters for **Patterns**, **Alerts**, and **Alert
Resolutions**, and migrates `patterns.service` and `alerts.service` to the
repository layer. This unlocks the alert-dependent Telegram flows in firebase
mode (`sendAlertToChannel`, `getApprovalQueue`).

Prisma remains the default and is unchanged in behaviour.

## Collections

### `patterns/{patternId}`

| Field | Type | Notes |
|-------|------|-------|
| userId | string | owner, default `"default"` |
| name | string | |
| description | string | default `""` |
| status | string | `active` \| `paused` \| `draft` \| `archived` |
| severity | string | `critical` \| `attention` \| `info` |
| scope | string | `all` \| `favorites_only` \| ... |
| action | string | `register_alert` \| `suggest_only` \| `highlight` |
| minConfidence | number | |
| requireRichData | boolean | |
| onlyLive | boolean | |
| onlyPreMatch | boolean | |
| conditionsJson | string | JSON array (stored as string, like Prisma) |
| scopeFilterJson | string \| null | JSON array |
| extendedJson | string \| null | JSON object — never overwritten with undefined |
| templateId | string \| null | |
| createdAt | string (ISO) | |
| updatedAt | string (ISO) | stamped on every write |

`archive()` is a **soft delete** (`status='archived'`), never a physical delete.

### `alerts/{alertId}`

| Field | Type | Notes |
|-------|------|-------|
| userId | string | owner |
| patternId | string | |
| fixtureId | string | |
| status | string | `pending` \| `confirmed` \| `confirmed_partial` \| `failed` \| `unknown` \| `expired` |
| confidence | number | |
| signalState | string | default `ready_to_alert` |
| triggerMinute | number \| null | |
| triggerScoreHome | number | default 0 |
| triggerScoreAway | number | default 0 |
| evidenceJson | string | JSON array — never overwritten with undefined |
| temporalEvidenceJson | string \| null | |
| duplicateSignature | string \| null | used for dedup |
| createdAt | string (ISO) | |
| updatedAt | string (ISO) | |

`status='unknown'` is preserved as a first-class status and is never coerced to
`failed`.

### `alertResolutions/{alertId}` — deterministic id = alertId

| Field | Type | Notes |
|-------|------|-------|
| alertId | string | = doc id |
| resolutionStatus | string | `confirmed` \| `confirmed_partial` \| `failed` \| `unknown` \| `expired` |
| resolutionType | string \| null | e.g. `goal_pressure` |
| windowMinutes | number \| null | |
| evidenceJson | string | JSON array, default `[]` |
| resolvedAt | string (ISO) | |
| createdAt | string (ISO) | |

The deterministic doc id (`= alertId`) mirrors Prisma's `@unique` constraint on
`alertId`: exactly one resolution per alert, no duplicates. `resolveAlert()`
updates `alert.status` and writes the resolution in a single Firestore **batch**.

## Queries

To keep firebase mode working out-of-the-box (the user runs the backend locally
for testing), adapters use **single-equality queries + in-memory filter/sort**,
matching the E2 Telegram precedent. This avoids requiring manually-created
composite indexes for a single default user.

| Repository | Method | Query strategy |
|-----------|--------|----------------|
| Pattern | listAll / listActive | `where userId ==`, in-memory sort by `updatedAt` desc |
| Pattern | findById | doc get + userId check |
| Alert | list / listForApprovalQueue | `where userId ==`, in-memory filter (status, patternId, confidence, since) + sort `createdAt` desc + slice limit |
| Alert | findByDuplicateSignature | `where duplicateSignature ==`, in-memory userId + cutoff filter |
| Alert | findRecentByPatternFixture | `where patternId ==`, in-memory fixtureId + userId + cutoff |
| Alert | findByFixtureIds | `where fixtureId ==` |
| Alert | listPending | `where userId ==`, in-memory status filter + sort `createdAt` asc |
| AlertResolution | findByAlertId / findByAlertIds | direct doc get(s) by deterministic id |

ISO timestamps sort lexicographically by time, so string comparison is used for
`createdAt`/`updatedAt` ordering and cutoff filters.

## Recommended composite indexes (production scale)

In-memory refinement is fine for the current single-user volume. As alert volume
grows, create these Firestore composite indexes and switch the adapters to
server-side `where + orderBy + limit`:

- `alerts`: `userId` ASC, `createdAt` DESC
- `alerts`: `userId` ASC, `status` ASC, `createdAt` DESC
- `alerts`: `duplicateSignature` ASC, `createdAt` DESC
- `alerts`: `patternId` ASC, `fixtureId` ASC, `createdAt` DESC
- `patterns`: `userId` ASC, `updatedAt` DESC

## Telegram unlocked in firebase mode

With `FirebaseAlertRepository` in place:
- `sendAlertToChannel` resolves the alert via `repos.alerts.findById` ✅
- `getApprovalQueue` lists alerts via `repos.alerts.listForApprovalQueue` ✅
- channel rules, deliveries (Firestore), and idempotent ignore continue working

These flows operate on alerts that already exist in Firestore. No data is
migrated from Postgres automatically.

## Limitations (still open after E3)

- **Fixtures / LiveSnapshots / Odds** are not migrated — they throw clear
  "not implemented yet" errors in firebase mode (E4+).
- **Workers** (live monitor, pattern evaluation, alert resolution) still use
  Prisma directly and require `PERSISTENCE_PROVIDER=prisma`.
- **Performance analytics** still uses Prisma aggregations; Firestore re-modeling
  with denormalized counters is planned (E5).
- **No data migration** has been performed; switching to firebase mode starts
  from empty collections.

## Verification

Backend: `npm run db:generate` (local binary, not `npx prisma`), `npm run typecheck`, `npm run build` — all pass.
Frontend: `npm run check:encoding`, `npx tsc --noEmit`, `npx vite build` — all pass.
