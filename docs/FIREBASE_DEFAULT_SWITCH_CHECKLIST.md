# Firebase Default Switch Checklist (Phase E7)

The default `PERSISTENCE_PROVIDER` stays **`prisma`**. Only flip the default to
`firebase` (or set it in production deploy env) after EVERY item below is checked.
This is a gate, not an action for this phase.

## GO / NO-GO gate (updated E9.2)

**Current decision: NO-GO for production cutover.** Critical gates still pending.

| Gate | Status |
|------|--------|
| Firebase active in controlled env | ✅ done (E8/E9) |
| Smoke tests (all read routes) | ✅ done |
| Controlled write test (pattern/alert/resolve/counter/rebuild) | ✅ done |
| Live worker cycle (fetch + provider health + smart-diff) | ✅ done |
| Live worker **rich** snapshot capture | ⏳ pending — no live match in windows tested |
| Pattern worker **rich** validation (real live match) | ⏳ pending — no live match; no fake alert |
| Resolution worker **real alert** validation | ⏳ pending — no live alert |
| Telegram real-alert validation (manual, no auto-send) | ⏳ pending — needs a real alert; logic validated E6.1 |
| Performance post-resolution validation | ⏳ pending — needs a real live resolution |
| Backup/export Firestore | ⏳ pending — owner gcloud/Console access (`FIREBASE_BACKUP_EXECUTION_STATUS.md`) |
| Firestore indexes deployed | ⏳ pending — Firebase CLI unavailable (`FIRESTORE_INDEX_DEPLOY_STATUS.md`) |
| Odds provider | disabled/suspended (API-Football) |
| Rollback to Prisma | ✅ ready (`FIREBASE_ROLLBACK_RUNBOOK.md`; env guard validated) |
| Prisma not removed / default unchanged | ✅ enforced |

Tooling to close the live gates: `scripts/watchLiveValidationWindow.mjs`
(`LIVE_WORKER_VALIDATION_RUNBOOK.md`, `LIVE_VALIDATION_WATCH_REPORT.md`).

## Pre-switch checklist

Legend: [x] done in staging (E8) · [ ] pending for the production switch (E9).

- [x] Firebase credentials configured (local `backend/.env` via `FIREBASE_SERVICE_ACCOUNT_PATH`; deploy env still TODO).
- [x] `PERSISTENCE_PROVIDER=firebase` validated in **staging/dev** (real project goalsense-29892).
- [x] Backend boots with **no `DATABASE_URL`** in firebase mode.
- [x] Live Monitor worker validated (fixtures + snapshots written to Firestore — E6.1).
- [ ] Pattern worker validated against a **live in-progress match** (E9.1: ran clean but **PENDING — no live match available** in the window; no fake alert created).
- [ ] Resolution worker validated against a **real pending alert from a live match** (E9.1: ran clean but **PENDING — no live alert**; logic validated via API in E6.1/E6.2).
- [x] Telegram validated (channels, rules, eligibility, approval queue — E6.1).
- [x] Performance counters validated (incremental + on-demand fallback + rebuild; idempotency — E6.2).
- [x] Odds disabled/unavailable path validated (no crash).
- [x] Recommended composite indexes materialized (`firestore.indexes.json`); **deploy to the project still pending (E9)**.
- [x] QA data cleanup executed (`scripts/firebaseCleanupQaData.mjs --confirm` → 19 docs removed; re-run dry-run = 0).
- [ ] Firestore backup/export taken (`gcloud firestore export`). — runbook ready (`FIREBASE_BACKUP_RUNBOOK.md`); **PENDING owner access** (E9.1 not executed; not fabricated).
- [x] Retention policy decided (`FIREBASE_RETENTION_POLICY.md`).
- [x] Rollback plan confirmed (env guard validated; `PERSISTENCE_PROVIDER=prisma` + `DATABASE_URL` reverts — `FIREBASE_ROLLBACK_RUNBOOK.md`).
- [x] Observability reviewed (`/api/health` provider diagnostic + worker status endpoints + counter-failure warnings).
- [x] Firebase active as the **controlled-environment** provider (E9); smoke tests + controlled write test passed.
- [ ] Firebase CLI available + `firebase deploy --only firestore:indexes` run (CLI not installed; pending E10).

## Switch

- Set `PERSISTENCE_PROVIDER=firebase` in the production deploy environment
  (NOT in the committed default). Keep Prisma config available for rollback.

## Rollback

1. Set `PERSISTENCE_PROVIDER=prisma` and restore `DATABASE_URL`.
2. Redeploy. All Prisma adapters are intact; behaviour returns to the prior state.
3. Any data written to Firestore during the firebase window stays in Firestore
   (no automatic back-migration); plan a reconciliation if needed.

## Not in scope (future phases)

- Removing Prisma / the `repositories/prisma/*` adapters.
- Changing the committed default.
- Real Prisma→Firebase data migration writes.
