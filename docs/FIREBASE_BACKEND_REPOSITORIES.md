# Firebase Backend Repositories (Phase E2)

This document describes the Firestore-backed repositories that exist today, the
collections they use, deterministic id conventions, current limitations, and the
next steps. It complements `BACKEND_PERSISTENCE_STRATEGY.md`.

## Provider selection

The backend chooses persistence at startup via `PERSISTENCE_PROVIDER`:

- `PERSISTENCE_PROVIDER=prisma` (default) — all repositories use Prisma/Postgres. Requires `DATABASE_URL`.
- `PERSISTENCE_PROVIDER=firebase` — repositories that have a Firestore adapter use Firestore; the rest throw a clear "not implemented yet" error. Requires Firebase Admin credentials, no `DATABASE_URL`.

Selection is centralized in `backend/src/repositories/index.ts` (`createRepositories()`), cached after first call.

## Firebase Admin init

`backend/src/firebase/admin.ts`:

- Lazy: Firestore is only initialized on first `getFirestore()` call.
- `firebase-admin` is loaded via dynamic import, so the Prisma path never touches it.
- Credentials resolved from either:
  - `FIREBASE_SERVICE_ACCOUNT_JSON` (full service account JSON, single line),
  - `FIREBASE_SERVICE_ACCOUNT_PATH` (path to a JSON file — local convenience, never commit the file), or
  - `FIREBASE_PROJECT_ID` + `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`
- Private keys with literal `\n` are normalized to real newlines.
- Credentials never leave the backend and are never bundled into the frontend.

## Implemented Firestore adapters

### ProviderHealthRepository (E1)

File: `backend/src/repositories/firebase/firebaseProviderHealth.repository.ts`

| Method | Behaviour |
|--------|-----------|
| `create(input)` | Adds a doc to `providerHealth` with auto id; stamps `checkedAt` + `createdAt` (ISO) |
| `listRecent({ provider?, limit? })` | Ordered by `checkedAt` desc, optional `provider` filter, default limit 20 |

Collection: `providerHealth/{autoId}`
Fields: `provider`, `endpoint`, `status` (`ok` \| `degraded` \| `down`), `latencyMs`, `errorMessage`, `checkedAt`, `createdAt`.

Used by:
- `liveMonitor.service.ts` → `recordProviderHealth`
- `liveMonitor.routes.ts` → `GET /provider-health`

### TelegramRepository (E2)

File: `backend/src/repositories/firebase/firebaseTelegram.repository.ts`

Collections:
- `telegramChannels/{autoId}`
- `signalDeliveries/{alertId}__{channelId}` — **deterministic id**

**Channels**

| Method | Behaviour |
|--------|-----------|
| `listChannels(userId)` | `where userId == userId`, sorted by `createdAt` desc in-memory |
| `findChannel(id, userId)` | doc get + userId ownership check |
| `createChannel(input, userId)` | auto id, stamps `createdAt`/`updatedAt`, defaults `type='group'`, `isActive=true` |
| `deleteChannel(id)` | hard delete |
| `updateChannelRules(id, rulesJson)` | updates `rulesJson` + `updatedAt` |

Channel fields: `userId`, `name`, `chatId`, `type`, `isActive`, `rulesJson`, `createdAt`, `updatedAt`.

**Deliveries**

| Method | Behaviour |
|--------|-----------|
| `findDelivery(alertId, channelId, status?)` | doc get by deterministic id, optional status filter |
| `listDeliveries({ userId, alertId?, limit? })` | `where userId`, optional `alertId`, sorted by `createdAt` desc in-memory |
| `createDelivery(input)` | `set(..., { merge: true })` on deterministic id → idempotent |
| `updateDelivery(id, patch)` | `set(..., { merge: true })`, undefined → null |
| `findRecentDeliveryByChannel(channelId, sinceDate)` | status=`sent` query, in-memory `sentAt >= since` filter |
| `countSentDeliveries(channelId, alertIds)` | status=`sent` query, in-memory `alertId in set` count |

Delivery fields: `userId`, `alertId`, `channelId`, `status` (`pending`\|`sent`\|`failed`\|`skipped`), `provider`, `messageText`, `errorMessage`, `sentAt`, `createdAt`.

#### Why a deterministic delivery id

`${alertId}__${channelId}` guarantees one delivery record per (alert, channel)
pair. Re-sending or re-queuing the same alert to the same channel updates the
existing record instead of creating duplicates — this is the Firestore
equivalent of the anti-duplicate guarantee the Prisma path enforced with a
unique lookup. Writes use `set(..., { merge: true })` so partial updates are safe.

## Migrated services (provider-agnostic)

These now call `createRepositories()` instead of importing `prisma` for the
migrated concerns:

- `backend/src/modules/live/liveMonitor.service.ts` — `recordProviderHealth`
  (note: `upsertFixture` and `captureLiveSnapshot` still use Prisma directly; the
  `prisma` import remains valid and required there until E4)
- `backend/src/modules/live/liveMonitor.routes.ts` — `/provider-health`
- `backend/src/modules/telegram/telegram.service.ts` — channels, deliveries,
  `sendAlertToChannel`, `getApprovalQueue`, `ignoreAlertInQueue`
- `backend/src/modules/telegram/telegramChannelRules.service.ts`
- `backend/src/modules/patterns/patterns.service.ts` — list/get/create/update/delete (E3)
- `backend/src/modules/alerts/alerts.service.ts` — list/get/create/resolve + dedup (E3)
- `backend/src/modules/live/liveMonitor.service.ts` — `upsertFixture` +
  `captureLiveSnapshot` now use `repos.fixtures` / `repos.liveSnapshots`; no
  `prisma` import remains (E4)
- `backend/src/modules/live/liveMonitor.routes.ts` — `/live-snapshots/recent`,
  `/fixtures/live`, `/provider-health` use the repository layer (E4)
- `backend/src/modules/command/backendDuplicateGuard.service.ts` — duplicate guard
  via `alerts.findByDuplicateSignature` / `findRecentByPatternFixture` (E5)
- `backend/src/modules/command/commandEvaluation.service.ts` — pattern evaluation
  worker logic, repo-backed; no `prisma` import (E5)
- `backend/src/modules/command/alertResolution.service.ts` — resolution worker
  logic, repo-backed; atomic resolve via `alertResolutions.resolveAlert` (E5)
- `backend/src/modules/odds/odds.service.ts` + `oddsCoverageAudit.service.ts` +
  `odds.routes.ts` — repo-backed (E5)
- `backend/src/modules/telegram/telegram.routes.ts` — rules PATCH + eligibility
  GET use the repository layer (E5)
- `backend/src/modules/performance/performance.service.ts` — pattern + summary
  analytics, repo-backed via `patterns`/`alerts`/`alertResolutions`; no `prisma`
  import (E6)

## E2 / E3 / E4 / E5 / E6 status

- ✅ **E2** — ProviderHealth + Telegram (channels + deliveries) on Firestore.
- ✅ **E3** — Patterns + Alerts + AlertResolutions on Firestore. Alert-dependent
  Telegram flows (`sendAlertToChannel`, `getApprovalQueue`) work in firebase mode.
- ✅ **E4** — Fixtures + LiveSnapshots on Firestore. The Live Monitor
  (service + routes + worker) runs in firebase mode without Postgres.
- ✅ **E5** — Odds on Firestore; Command Center workers (pattern evaluation +
  resolution) and the odds/telegram routes are repository-backed and run in
  firebase mode.
- ✅ **E6** — Performance analytics repository-backed (on-demand, provider-agnostic).
  Direct Prisma usage now confined to `db/client.ts` + the Prisma adapter. See
  `FIREBASE_PERFORMANCE_ANALYTICS.md`.
- ✅ **E6.1** — Full backend validated end-to-end in firebase mode against a real
  Firestore project (no Postgres). See `FIREBASE_RUNTIME_QA.md`. No Firestore
  composite index was required for the QA (single-equality + in-memory sort);
  recommended indexes for scale are documented.

## Limitations (still open after E6)

- **Performance analytics** computes on-demand by scanning alerts/resolutions per
  request. Firebase reads are capped at 2000 for performance queries. Incremental
  denormalized counters are deferred to **E6.1**.
- **In-memory filtering / sorting** in several adapters. Fine at current
  single-user volume; switch to Firestore composite indexes + server-side
  `orderBy/limit` as volume grows (indexes listed in the per-phase migration docs).
- **No data migration** has been performed. Switching providers starts from empty
  Firestore collections.
- **Full firebase runtime** depends on real credentials and populated collections;
  the phases validate typecheck/build + repository wiring.

## How to run

### Prisma mode (default, full functionality)

```
PERSISTENCE_PROVIDER=prisma
DATABASE_URL=postgresql://...
```

Generate the client with the local binary (avoids the `npx prisma` hang):

```
cd backend
npm run db:generate
npm run typecheck
npm run build
```

### Firebase mode (full backend — no Postgres required)

```
PERSISTENCE_PROVIDER=firebase
FIREBASE_SERVICE_ACCOUNT_JSON={...}        # or the 3 separate vars
```

No `DATABASE_URL` required. Live Monitor, Pattern Evaluation, and Alert
Resolution workers run in firebase mode, plus Odds, Telegram, and Performance
analytics. Every backend module is now repository-backed; no module imports
Prisma directly.

## Next steps (E6.2)

- **E6.2** — Implement incremental denormalized performance counters (design in
  `FIREBASE_PERFORMANCE_ANALYTICS.md`) to replace the on-demand scan; add a
  reconciliation job; then remove Prisma once all adapters are validated in
  production.
