# Firebase → Prisma Rollback Runbook

How to revert the backend from firebase mode to prisma mode. Prisma is NOT
removed; this is always available.

## Rollback

Set in the deploy/local environment:

```
PERSISTENCE_PROVIDER=prisma
DATABASE_URL=postgresql://user:pass@host:5432/goalsense?schema=public
```

Then restart / redeploy. The Prisma adapters (`repositories/prisma/*`) are intact,
so behaviour returns to the prior state immediately. Confirm via:

```
GET /api/health  →  { "persistenceProvider": "prisma", "databaseUrlConfigured": true }
```

## Guard behaviour (validated, Phase E8/E9)

- `PERSISTENCE_PROVIDER=prisma` with an empty/missing `DATABASE_URL` throws a clear
  startup error: **"DATABASE_URL is required when PERSISTENCE_PROVIDER=prisma"**.
  This prevents a half-configured prisma boot. Verified by loading `dist/env.js`
  with `PERSISTENCE_PROVIDER=prisma` and no `DATABASE_URL` (the env guard threw).
- `npm run typecheck` and `npm run build` pass with both adapters compiled, so the
  prisma code path is always shippable.

## Local note

There is no local Postgres in the dev box, so prisma **runtime** is marked
"dependent on `DATABASE_URL`/Postgres". To exercise it locally, point
`DATABASE_URL` at a Postgres instance and `npm run db:generate` first.

## Data caveat

Data written to Firestore while firebase mode was active stays in Firestore. A
rollback to prisma does not back-migrate it. If both stores diverge, plan a
reconciliation (see `FIREBASE_DATA_MIGRATION_PLAN.md`).

## What rollback does NOT require

- No code change (it's an env switch).
- No removal of Firebase adapters.
- No schema change.
