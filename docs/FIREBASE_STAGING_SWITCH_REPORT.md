# Firebase Staging Switch Report (Phase E8)

Controlled preparation to run Firebase as the active provider in **staging/dev**.
The committed global default stays `prisma`; firebase is activated via the local
`backend/.env` only. Prisma is not removed; rollback is preserved.

## Active provider (staging/dev)

Set in `backend/.env` (gitignored):

```
PERSISTENCE_PROVIDER=firebase
FIREBASE_SERVICE_ACCOUNT_PATH=../goalsense-29892-firebase-adminsdk-...json
# no DATABASE_URL needed
```

`/api/health` now reports the active provider without secrets:

```json
{ "persistenceProvider": "firebase", "databaseUrlConfigured": false,
  "firebaseConfigured": true, "firebaseProjectId": "goal***892" }
```

## Indexes

`firestore.indexes.json` (repo root) materializes the recommended composite
indexes (alerts, liveSnapshots, fixtures, signalDeliveries, oddsSnapshots).

Deploy (only when Firebase CLI is configured for the project; NOT run here):

```
firebase deploy --only firestore:indexes
```

**No composite index is required for current usage** — adapters use
single-equality queries + in-memory sort, and no "needs index" error occurred in
runtime validation. Apply these before switching adapters to server-side
`where + orderBy + limit` at scale.

## QA data cleanup

- `node scripts/firebaseCleanupQaData.mjs --dry-run` → matched **19** QA docs
  (3 patterns, 5 alerts, 5 resolutions, 1 telegram channel, 1 counter, 4 processed markers).
- `node scripts/firebaseCleanupQaData.mjs --confirm` → deleted all 19 (test data
  created during E6.1/E6.2 runtime QA).
- Re-run dry-run → **0 matched** (clean).

Real provider data (fixtures/liveSnapshots/providerHealth from the ESPN live
worker) was intentionally NOT deleted by the QA cleanup.

## Rebuild performance counters

- `node scripts/rebuildPerformanceCounters.mjs` (dry-run) → after cleanup,
  **0 active patterns** (nothing to rebuild). Idempotent; `--confirm` drives the
  dev rebuild endpoint per pattern.

## Migration dry-run

- `node scripts/migratePrismaToFirebase.mjs` → `DATABASE_URL` not set → honest
  exit (no Postgres locally). **No write performed.** Real Prisma→Firebase writes
  remain intentionally unimplemented (see `FIREBASE_DATA_MIGRATION_PLAN.md`).

## Staging runtime validation (firebase mode, project goalsense-29892)

| Route | Result |
|-------|--------|
| `GET /api/health` | ✅ provider diagnostic (firebase, masked project id) |
| `GET /api/provider-health` | ✅ reads Firestore (real ESPN health records) |
| `GET /api/patterns` | ✅ (empty after cleanup) |
| `GET /api/alerts` | ✅ (empty after cleanup) |
| `GET /api/telegram/status` | ✅ `enabled:false`, channels read from Firestore |
| `GET /api/fixtures/live` | ✅ `[]` (no live matches at validation time) |
| `GET /api/live-snapshots/recent` | ✅ reads Firestore |
| `GET /api/performance/summary` | ✅ honest aggregation (unknownRate respects total; unknown ≠ failed) |
| `GET /api/odds/status` | ✅ `enabled:false`, no crash |
| `GET /api/pattern-worker/status` / `/resolution-worker/status` | ✅ |

Patterns/Alerts CRUD + resolve + incremental counters were validated end-to-end
in E6.1/E6.2 (`FIREBASE_RUNTIME_QA.md`, `FIREBASE_PERFORMANCE_ANALYTICS.md`).

## Rollback to Prisma (validated)

- `PERSISTENCE_PROVIDER=prisma` with empty `DATABASE_URL` → env guard throws a
  clear error ("DATABASE_URL is required when PERSISTENCE_PROVIDER=prisma"),
  confirming the prisma path is wired and validated.
- Full rollback: set `PERSISTENCE_PROVIDER=prisma` + `DATABASE_URL=...` and
  redeploy. Prisma adapters remain intact; behaviour returns to the prior state.
- Local Prisma runtime requires a Postgres instance (none locally) — verified via
  `npm run typecheck` + `npm run build` (both adapters compile).

## Not changed (scope control)

- Committed global default still `prisma` (no hardcoded switch).
- Prisma, `schema.prisma`, and `repositories/prisma/*` not removed.
- Telegram unchanged (no auto-send, no odds in messages). Odds unchanged.
- Command Center UX unchanged. Resolution/precision logic unchanged.

## Pending for E9

- Flip the deploy-env default to firebase after the full checklist
  (`FIREBASE_DEFAULT_SWITCH_CHECKLIST.md`), with a live-match worker validation.
- Apply `firestore.indexes.json` in the Firebase project.
- Approve + execute the real (selective) Prisma→Firebase data migration if a
  Postgres source exists.
- Eventually remove Prisma once firebase is the validated production default.
