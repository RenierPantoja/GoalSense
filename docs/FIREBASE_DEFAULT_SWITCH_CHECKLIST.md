# Firebase Default Switch Checklist (Phase E7)

The default `PERSISTENCE_PROVIDER` stays **`prisma`**. Only flip the default to
`firebase` (or set it in production deploy env) after EVERY item below is checked.
This is a gate, not an action for this phase.

## Pre-switch checklist

Legend: [x] done in staging (E8) · [ ] pending for the production switch (E9).

- [x] Firebase credentials configured (local `backend/.env` via `FIREBASE_SERVICE_ACCOUNT_PATH`; deploy env still TODO).
- [x] `PERSISTENCE_PROVIDER=firebase` validated in **staging/dev** (real project goalsense-29892).
- [x] Backend boots with **no `DATABASE_URL`** in firebase mode.
- [x] Live Monitor worker validated (fixtures + snapshots written to Firestore — E6.1).
- [ ] Pattern worker validated against a **live in-progress match** (validated with no live match at QA time; needs a real match window).
- [ ] Resolution worker validated against a **real pending alert from a live match** (logic validated via API in E6.1/E6.2).
- [x] Telegram validated (channels, rules, eligibility, approval queue — E6.1).
- [x] Performance counters validated (incremental + on-demand fallback + rebuild; idempotency — E6.2).
- [x] Odds disabled/unavailable path validated (no crash).
- [x] Recommended composite indexes materialized (`firestore.indexes.json`); **deploy to the project still pending (E9)**.
- [x] QA data cleanup executed (`scripts/firebaseCleanupQaData.mjs --confirm` → 19 docs removed; re-run dry-run = 0).
- [ ] Firestore backup/export taken (`gcloud firestore export`). — runbook ready (`FIREBASE_BACKUP_RUNBOOK.md`); pending owner access (E9).
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
