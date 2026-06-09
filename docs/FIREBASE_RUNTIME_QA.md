# Firebase Runtime QA (Phase E6.1)

End-to-end runtime validation of the backend in `PERSISTENCE_PROVIDER=firebase`
against a **real Firestore project** (`goalsense-29892`), with no Postgres and no
`DATABASE_URL`. All tests used the live backend (`npm run dev`) and real HTTP
requests.

## Local setup

- `backend/.env` (gitignored): `PERSISTENCE_PROVIDER=firebase` +
  `FIREBASE_SERVICE_ACCOUNT_PATH` pointing at the service-account JSON in the repo
  root (also gitignored via `*-firebase-adminsdk-*.json`).
- New credential option added: `FIREBASE_SERVICE_ACCOUNT_PATH` (reads + parses a
  JSON file, normalizes `\n` in the private key) — avoids pasting the key into
  `.env`. `FIREBASE_SERVICE_ACCOUNT_JSON` and the 3 separate vars still work.
- Backend started with **no `DATABASE_URL`** and did not initialize Prisma.
- Firebase Admin initialized lazily on first repository call:
  `[Firebase] Admin initialized for project goalsense-29892`.

## Results

| Area | Result |
|------|--------|
| `GET /api/health` | ✅ ok |
| `GET /api/provider-health` | ✅ reads Firestore (empty → `[]` honest); worker writes health docs |
| `POST /api/patterns` | ✅ created in `patterns/` with `conditionsJson` + `extendedJson` preserved |
| `PATCH /api/patterns/:id` (name only) | ✅ only `name` changed; `extendedJson`/`conditionsJson` preserved (no undefined overwrite) |
| `DELETE /api/patterns/:id` | ✅ soft delete → `status: archived`, doc still present |
| `GET /api/performance/patterns` | ✅ archived pattern excluded |
| `POST /api/alerts` | ✅ created in `alerts/` with evidence + temporal preserved |
| `POST /api/alerts` (dup signature) | ✅ returns existing alert (same id, same createdAt) — dedup works |
| `POST /api/alerts/:id/resolve` (unknown) | ✅ atomic: `status` → `unknown` (NOT failed); resolution doc created (deterministic id) |
| `GET /api/performance/summary` | ✅ `unknownCount:1`, `failedCount:0`, `resolvedCount:0`, rates `null` (sample < 5) |
| `GET /api/performance/patterns/:id` | ✅ `insufficient_sample`; breakdowns `byResolutionType:{goal_pressure:1}` (resolution read via `findByAlertIds`), `byMomentumSource:{timed_events:1}` |
| `POST /api/telegram/channels` | ✅ created in `telegramChannels/` |
| `PATCH /api/telegram/channels/:id/rules` | ✅ `rulesJson` persisted |
| `GET /api/telegram/eligibility/:alertId` | ✅ reads alert + rules + deliveries; confidence 72 ≥ minConfidence 60 → eligible |
| `GET /api/telegram/status` | ✅ `enabled:false`, `channelsCount:1` (TELEGRAM disabled in QA) |
| `GET /api/telegram/approval-queue` | ✅ `[]` (Telegram disabled → honest empty) |
| Live worker (`LIVE_WORKER_ENABLED=true`) | ✅ Run #1: 40 fixtures + 40 snapshots written to Firestore; Run #2: 0 snapshots (smart-diff dedup, no regression) |
| `GET /api/live-snapshots/recent` | ✅ reads snapshots; fixture id deterministic `espn__401865553`; `capturedAt` ISO |
| Pattern worker (`PATTERN_WORKER_ENABLED=true`) | ✅ `totalRuns:4`, `patternsChecked:4` (reads active patterns), `fixturesChecked:0`, `consecutiveErrors:0`, `lastError:null` |
| Resolution worker (`RESOLUTION_WORKER_ENABLED=true`) | ✅ `totalRuns:2`, `resolved:0` (no pending), `consecutiveErrors:0`, `lastError:null` |
| `GET /api/odds/status` | ✅ `enabled:false` (disabled in QA) — no crash |
| `GET /api/odds/alert/:id` (disabled) | ✅ `available:false`, honest empty |

## Runtime-dependent limitations (not bugs)

- At QA time **no matches were in-progress** (all ESPN fixtures `FT`), so:
  - snapshots were `poor` quality (no live stats/events to enrich);
  - `/api/fixtures/live` returned `[]` (only live statuses listed);
  - the Pattern Worker evaluated `fixturesChecked:0` and created no alerts
    (correctly — non-live/blocked statuses are gated);
  - the Resolution Worker had no pending alerts to resolve.
  The write→dedup→read pipeline, worker scheduling, Firestore connectivity, and
  repository wiring are all validated. Rich-data alerting + resolution outcomes
  require live in-progress matches and can be re-checked during a match window.
- **Odds**: not exercised against a live provider (API-Football account
  suspended / disabled in QA). The disabled path is honest; the persistence path
  is covered by typecheck/build + the repository contract.
- Alert-create/resolve and performance were validated **directly via the API**
  (same repo-backed services the workers use), so the worker logic is covered
  even without live matches.

## Firestore indexes

**Required for the QA performed: none.** Every adapter uses single-equality
queries + in-memory sort/filter, so no composite index was requested by Firestore
during the full run (no "needs index" errors observed).

**Recommended for production scale** (switch adapters to server-side
`where + orderBy + limit` once created):

- `alerts`: `userId` ASC, `createdAt` DESC
- `alerts`: `patternId` ASC, `createdAt` DESC
- `alerts`: `userId` ASC, `status` ASC, `createdAt` DESC
- `alerts`: `duplicateSignature` ASC, `createdAt` DESC
- `liveSnapshots`: `fixtureId` ASC, `capturedAt` DESC
- `fixtures`: `status` ASC, `updatedAt` DESC
- `signalDeliveries`: `channelId` ASC, `status` ASC
- `oddsSnapshots`: `fixtureId` ASC, `capturedAt` DESC

(Single-field indexes — `capturedAt`, `createdAt`, `canonicalKey` — are automatic.)

## Prisma import audit (re-confirmed)

Direct Prisma usage exists only in:
- `backend/src/db/client.ts`
- `backend/src/repositories/prisma/prismaRepositories.ts`

No service, route, or worker imports Prisma directly.

## QA test data

QA wrote real documents to the dev Firestore project (`patterns`, `alerts`,
`alertResolutions`, `telegramChannels`, `fixtures`, `liveSnapshots`,
`providerHealth`). These are dev test records and can be removed from the Firebase
console if desired. No automatic data migration was performed.

## Verification

Backend: `npm run db:generate`, `npm run typecheck`, `npm run build` — all pass.
Frontend: `npm run check:encoding`, `npx tsc --noEmit`, `npx vite build` — all pass.
