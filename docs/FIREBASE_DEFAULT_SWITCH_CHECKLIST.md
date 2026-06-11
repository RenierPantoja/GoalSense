# Firebase Default Switch Checklist (Phase E7)

The default `PERSISTENCE_PROVIDER` stays **`prisma`**. Only flip the default to
`firebase` (or set it in production deploy env) after EVERY item below is checked.
This is a gate, not an action for this phase.

## Pre-switch checklist

- [ ] Firebase credentials configured in the deploy environment
      (`FIREBASE_SERVICE_ACCOUNT_JSON` or the 3 vars; never commit the file).
- [ ] `PERSISTENCE_PROVIDER=firebase` validated in a **staging** environment first.
- [ ] Backend boots with **no `DATABASE_URL`** in firebase mode.
- [ ] Live Monitor worker validated (fixtures + snapshots written to Firestore).
- [ ] Pattern worker validated against a **live in-progress match** (creates real
      alerts; hard gates + duplicate guard intact).
- [ ] Resolution worker validated against a **real pending alert** (confirmed /
      partial / failed / unknown correct; `unknown` never becomes `failed`).
- [ ] Telegram validated (channels, rules, eligibility, approval queue, send with
      `confirm:true`, deterministic delivery id, no token in logs/responses).
- [ ] Performance counters validated (incremental + on-demand fallback + rebuild);
      idempotency confirmed (no double counting).
- [ ] Odds: disabled/unavailable path validated (no crash); if enabled, snapshots
      + alert context persist and odds never reach Telegram.
- [ ] Recommended composite indexes created in the Firebase project
      (`backend/firestore.indexes.recommended.json`).
- [ ] QA data cleanup executed (`scripts/firebaseCleanupQaData.mjs --confirm`).
- [ ] Firestore backup/export taken (`gcloud firestore export`).
- [ ] Retention policy decided (see `FIREBASE_RETENTION_POLICY.md`).
- [ ] Rollback plan confirmed: set `PERSISTENCE_PROVIDER=prisma` + `DATABASE_URL`
      to revert instantly (Prisma adapters remain in the codebase).
- [ ] Observability reviewed (worker status endpoints + counter-failure warnings).

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
