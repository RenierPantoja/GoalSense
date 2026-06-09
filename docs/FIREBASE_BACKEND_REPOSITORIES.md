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
  - `FIREBASE_SERVICE_ACCOUNT_JSON` (full service account JSON, single line), or
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
  `prisma` import remains valid and required there until E3)
- `backend/src/modules/live/liveMonitor.routes.ts` — `/provider-health`
- `backend/src/modules/telegram/telegram.service.ts` — channels, deliveries,
  `sendAlertToChannel`, `getApprovalQueue`, `ignoreAlertInQueue`
- `backend/src/modules/telegram/telegramChannelRules.service.ts`

## E2 limitations

- **Alert-dependent Telegram flows require Prisma mode.** `sendAlertToChannel`
  and `getApprovalQueue` read alerts via `repos.alerts`, which throws
  "not implemented yet" in firebase mode. Channel CRUD and delivery records work
  fully in firebase mode; only flows that load an alert are gated until E4.
- **In-memory filtering** in `findRecentDeliveryByChannel` / `countSentDeliveries`
  / `listChannels` / `listDeliveries` sorting. Fine at current volume; revisit
  with Firestore composite indexes and `orderBy` if delivery volume grows.
- **Patterns / Alerts / Resolutions / Fixtures / LiveSnapshots / Odds** are not
  yet migrated to Firestore — they throw clear errors in firebase mode.
- **Workers** (live monitor, pattern evaluation, alert resolution) still depend
  on Prisma directly and are not runnable in firebase mode yet.
- **No data migration** has been performed. Switching providers starts from empty
  Firestore collections.

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

### Firebase mode (ProviderHealth + Telegram channels/deliveries)

```
PERSISTENCE_PROVIDER=firebase
FIREBASE_SERVICE_ACCOUNT_JSON={...}        # or the 3 separate vars
```

No `DATABASE_URL` required. Alert-dependent flows and unmigrated modules will
return clear errors until E3/E4.

## Next steps (E3+)

- **E3** — `FirebaseFixtureRepository` + `FirebaseLiveSnapshotRepository`
  (snapshots as a `fixtures/{id}/snapshots` subcollection; mind read costs + TTL).
- **E4** — `FirebaseAlertRepository` + `FirebaseAlertResolutionRepository` +
  `FirebasePatternRepository`. Unlocks Telegram send/queue in firebase mode.
- **E5** — Performance analytics re-modeled with denormalized counters.
- **E6** — Remove Prisma once all adapters exist and are validated.
