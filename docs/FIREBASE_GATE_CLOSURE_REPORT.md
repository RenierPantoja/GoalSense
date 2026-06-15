# Firebase Gate Closure Report (Phase E9.3)

Attempt to close the remaining operational gates before any E10/production
cutover. Honest results — no gate marked DONE without evidence.

- **Date/time:** 2026-06-15 ~23:10–23:18 UTC
- **Provider:** firebase (controlled env) · project `goal***892`

## Firebase CLI

- Not globally installed; **available via `npx firebase-tools` (v15.20.0)**.
- `firebase.json` created at repo root (references `firestore.indexes.json`).

## Firestore index deploy

- **FAILED — permission denied.** Tried `GOOGLE_APPLICATION_CREDENTIALS` =
  Admin SDK service account →
  `HTTP 403 — Permission denied to get service [firestore.googleapis.com]`.
- Root cause: the Admin SDK SA has data-access roles, not index/deploy roles.
- Fix path documented in `FIRESTORE_INDEX_DEPLOY_STATUS.md` (owner login, or grant
  Cloud Datastore Index Admin + Service Usage Consumer to the SA).
- Not blocking staging (adapters use single-equality + in-memory sort; no index
  error at runtime).

## Backup / export

- **PENDING.** `gcloud`/`gsutil` not installed; Admin SDK SA lacks export IAM roles
  (same permission class as the 403 above). Not fabricated. Runbook:
  `FIREBASE_BACKUP_RUNBOOK.md`; status: `FIREBASE_BACKUP_EXECUTION_STATUS.md`.

## Rollback Prisma

- ✅ Ready. Env guard validated in E8/E9; `FIREBASE_ROLLBACK_RUNBOOK.md`.

## Watcher — real window run

- **Command:** `node scripts/watchLiveValidationWindow.mjs --duration 3 --interval 45`
- **Window:** 2026-06-15 23:16–23:18 UTC · 4 samples
- **live fixtures:** 0 (`NO_LIVE_FIXTURES` in every sample)
- **snapshot quality:** n/a (no live fixtures)
- **alerts created:** 0
- **resolutions:** 0
- **validation status:** `NO_LIVE_FIXTURES`
- **worker errors:** none
- **conclusion:** No live match during the window — rich Pattern/Resolution worker
  validation remains **PENDING**. No fake alert created.

(An earlier 1-minute smoke run, 23:05 UTC, gave the same result — see
`LIVE_VALIDATION_WATCH_REPORT.md`.)

## Telegram

- Not exercised with a real alert (none generated — no live match). Logic
  validated in E6.1 (eligibility/approval queue). No auto-send. No odds. No token leak.

## Performance

- Post-resolution validation **PENDING** (no live resolution). Counter logic
  (incremental + fallback + idempotent rebuild) validated in E6.2/E8/E9.

## Cleanup QA

- No QA documents created in this run (watcher is observe-only; no `--create-qa-pattern`).
- Environment remains clean (verified 0 in E9.1/E9.2 cleanups).

## GO / NO-GO

**NO-GO for production cutover.** Open critical gates:

| Gate | Status |
|------|--------|
| Firestore index deploy | ❌ failed (SA permission) — owner action required |
| Backup/export | ⏳ pending — owner gcloud/Console access |
| Live worker rich validation | ⏳ pending — no live match in windows |
| Pattern worker rich validation | ⏳ pending — no live match (no fake alert) |
| Resolution worker real validation | ⏳ pending — no live alert |
| Telegram real-alert validation | ⏳ pending — no real alert |
| Performance post-resolution validation | ⏳ pending — no live resolution |
| Rollback to Prisma | ✅ ready |
| Prisma not removed / default unchanged | ✅ enforced |
| Odds provider | disabled/suspended (API-Football) |

## Pending for E10

1. Owner: deploy indexes (login or grant SA roles) — `FIRESTORE_INDEX_DEPLOY_STATUS.md`.
2. Owner: run Firestore backup/export — `FIREBASE_BACKUP_EXECUTION_STATUS.md`.
3. Run the watcher during a real live-rich window; validate Pattern + Resolution
   workers + Telegram + performance with real data.
4. Only then consider flipping the deploy-env default. Prisma removal stays later.
