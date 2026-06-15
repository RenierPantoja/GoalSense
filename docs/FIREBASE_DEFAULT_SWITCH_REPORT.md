# Firebase Default Switch Report (Phase E9)

Firebase activated as the provider in the **controlled (staging/dev) environment**
via `backend/.env`. The committed global code default remains `prisma`; Prisma is
not removed; rollback is preserved and validated.

## Active provider

- `PERSISTENCE_PROVIDER=firebase` (in `backend/.env`, gitignored).
- `FIREBASE_SERVICE_ACCOUNT_PATH` → repo-root service account (gitignored).
- No `DATABASE_URL` required.
- `GET /api/health` → `persistenceProvider:"firebase"`, `databaseUrlConfigured:false`,
  `firebaseConfigured:true`, `firebaseProjectId:"goal***892"` (masked). No secrets in logs/responses.
- Project: `goalsense-29892`.

## Infra

| Item | Status |
|------|--------|
| Backup / export | **Pending** — runbook `FIREBASE_BACKUP_RUNBOOK.md`; requires owner gcloud/Console access (not executed by agent) |
| Firestore indexes | `firestore.indexes.json` ready; **deploy pending** — Firebase CLI not installed in this environment (`firebase deploy --only firestore:indexes`) |
| Cleanup QA | ✅ executed — QA_E9_ test docs removed (`--confirm`), re-dry-run = 0 |
| Rollback Prisma | ✅ documented + guard validated (`FIREBASE_ROLLBACK_RUNBOOK.md`) |

No composite index error occurred at runtime (adapters use single-equality +
in-memory sort), so the missing index deploy does not block staging.

## Smoke tests (firebase default)

All green: `/api/health`, `/api/provider-health` (fresh June-15 records written by
the live worker), `/api/patterns`, `/api/alerts`, `/api/telegram/status`,
`/api/fixtures/live`, `/api/live-snapshots/recent`, `/api/performance/summary`
(clean zeros post-cleanup), `/api/odds/status`, `/api/pattern-worker/status`,
`/api/resolution-worker/status`.

## Controlled write test (QA_E9_, then cleaned)

- Created `QA_E9_Pattern`, one alert (`qa-e9-s1`), resolved `confirmed`.
- Performance counter: `source:incremental`, `sampleSize:1`, `resolvedCount:1`,
  `confirmedCount:1`, rates `null` (resolved < 5), breakdowns correct.
- Rebuild idempotent (identical numbers on repeat).
- All QA_E9_ docs removed afterward (verified 0).

## Workers (firebase default)

| Worker | Result |
|--------|--------|
| Live Monitor | ✅ operational — fetched ESPN (31 fixtures/run), wrote fresh `providerHealth` to Firestore, smart-diff produced 0 snapshots because the returned fixtures were already-captured finished (FT) matches and **no match was live**. Rich/live snapshot capture NOT exercised (no live match). |
| Pattern Worker | ✅ runs clean — `totalRuns:9`, `patternsChecked:9` (reads patterns from Firestore), `fixturesChecked:0` (no live fixtures), 0 errors. **NOT validated with a live rich match** (none available). No fake alert created. |
| Resolution Worker | ✅ runs clean — `totalRuns:5`, 0 pending alerts, 0 errors. **NOT validated end-to-end with a live alert** (none available); resolution logic validated via API in E6.1/E6.2. |

Honest note: there were no live in-progress matches during this window, so
rich-data alerting and live resolution outcomes could not be validated. The
worker cycles, Firestore connectivity, scheduling, and idempotency ARE validated.

## Telegram (firebase default)

`TELEGRAM_ENABLED=false` for QA → status honest (`enabled:false`), channel CRUD /
rules / eligibility / approval-queue validated in E6.1. No auto-send. No odds in
messages. No token exposed.

## Performance counters (firebase default)

Incremental when a counter exists (`source:incremental`), on-demand fallback when
absent (`source:on_demand`), per-pattern rebuild idempotent, rates null when
resolved < 5, `confirmed_partial` counts as useful, `unknown` separate from
`failed`. Re-resolution does not double-count.

## Odds (firebase default)

`ODDS_ENABLED=false` → `/api/odds/status` honest (`enabled:false`), no crash, no
fake odds, no invented D3 recommendation. API-Football remains suspended/disabled.

## Confirmations

- Prisma not removed; committed global default unchanged; firebase active only via
  controlled env config.
- Rollback preserved and validated.
- No data deleted without dry-run + `--confirm`.
- Credentials not exposed; project id masked.
- Command Center, Telegram, Odds, precision logic unchanged.

## Pending for E10

- Execute Firestore backup/export (owner access).
- Install Firebase CLI + deploy `firestore.indexes.json`.
- Validate Pattern + Resolution workers against a real live rich match.
- Flip the committed/deploy-env default after the full checklist.
- Approved selective data migration; eventual Prisma removal.
