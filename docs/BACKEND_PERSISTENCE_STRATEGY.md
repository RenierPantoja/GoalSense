# Backend Persistence Strategy

## Context

The GoalSense backend grew on Prisma/Postgres while the main app stack uses Firebase. This created a misalignment: two databases, runtime audits blocked without Postgres, more infra/cost for production.

Phase E1 introduces a **repository layer** to decouple services from Prisma, enabling an incremental migration to Firebase/Firestore without breaking what works.

## Prisma Usage Inventory

| File | Module | Models Used | Operations | Criticality | Migration Difficulty |
|------|--------|-------------|-----------|-------------|---------------------|
| `modules/patterns/patterns.service.ts` | patterns | Pattern | findMany, findFirst, create, updateMany | high | easy |
| `modules/alerts/alerts.service.ts` | alerts | Alert, AlertResolution | findMany, findFirst, create, $transaction | high | medium |
| `modules/performance/performance.service.ts` | performance | Alert, AlertResolution, Pattern | findMany, count (aggregations) | high | hard |
| `modules/live/liveMonitor.service.ts` | live | Fixture, LiveSnapshot, ProviderHealth | findFirst, create, update | high | medium |
| `modules/live/liveMonitor.routes.ts` | live | LiveSnapshot, Fixture, ProviderHealth | findMany | medium | easy |
| `modules/command/commandEvaluation.service.ts` | command | Pattern, Fixture, LiveSnapshot, Alert | findMany, findFirst, create | high | medium |
| `modules/command/alertResolution.service.ts` | command | Alert, AlertResolution, LiveSnapshot | findMany, $transaction | high | medium |
| `modules/command/backendDuplicateGuard.service.ts` | command | Alert | findFirst | medium | easy |
| `modules/telegram/telegram.service.ts` | telegram | TelegramChannel, SignalDelivery, Alert | findFirst, create, update | medium | easy |
| `modules/telegram/telegramChannelRules.service.ts` | telegram | SignalDelivery, Alert | findFirst, count | medium | easy |
| `modules/odds/odds.service.ts` | odds | OddsSnapshot, AlertOddsContext, Fixture, Alert | findMany, create | medium | medium |
| `modules/odds/oddsCoverageAudit.service.ts` | odds | Fixture | findUnique, findMany | low | easy |

**Total: 12 files coupled to Prisma.**

## Options Considered

### Option A — Keep Postgres/Prisma
**Pros:** Strong SQL, aggregate queries, transactions, easy performance analytics.
**Cons:** Extra DB outside Firebase, more infra/cost, misaligned with the project stack.

### Option B — Migrate backend to Firebase/Firestore
**Pros:** Aligned with project, no mandatory Postgres, simpler deploy, single stack.
**Cons:** Aggregate queries harder, different transactions, performance analytics needs careful modeling, per-read cost control needed.

### Option C — Hybrid (temporary)
**Pros:** Incremental migration.
**Cons:** Risk of two sources of truth.

## Recommendation

**Option B — migrate to Firebase/Firestore**, executed incrementally via the repository layer.

Rationale: the project is already Firebase-first; running a second database (Postgres) in production adds cost and operational complexity for no architectural benefit. The hardest part (performance aggregations) is solvable with denormalized counters and scheduled rollups in Firestore.

**Migration approach:** Strangler pattern via repositories.
1. ✅ E1 — Repository contracts + Prisma adapters + Firebase Admin + factory + 1 Firebase adapter (ProviderHealth)
2. ✅ E2 — Migrate simple modules (Telegram channels + deliveries, ProviderHealth) to Firestore behind the factory
3. ✅ E3 — Migrate Patterns + Alerts + AlertResolutions to Firestore; unlock Telegram alert-dependent flows in firebase mode
4. ✅ E4 — Migrate Fixtures + LiveSnapshots to Firestore; Live Monitor (service + routes + worker) runs without Postgres
5. ✅ E5 — Migrate Odds + Command Center workers (pattern evaluation + resolution) to repositories; both workers run in firebase mode
6. ✅ E6 — Migrate Performance analytics to repositories (on-demand, provider-agnostic). Prisma direct usage now confined to `db/client.ts` + the Prisma adapter.
7. ✅ E6.1 — Firebase runtime QA against a real Firestore project (all modules validated end-to-end, no Postgres); E6.2 incremental performance counters designed.
8. ✅ E6.2 — Incremental, idempotent performance counters implemented + validated in firebase runtime; on-demand kept as fallback + reconciliation. Prisma mode stays on-demand.
9. ✅ E7 — Production readiness: collection inventory, recommended indexes, retention policy, data migration plan, default-switch checklist, and dry-run maintenance scripts (QA cleanup, rebuild-all, Prisma→Firebase dry-run). Default stays prisma; Prisma not removed.
10. ✅ E8 — Staging switch prep: `firestore.indexes.json` materialized, QA data cleaned (`--confirm`, 19 docs), rebuild/migration dry-runs executed, firebase staging runtime validated, `/api/health` provider diagnostic, Prisma rollback validated. Default still prisma.
11. ✅ E9 — Firebase set as the controlled-environment default (via `backend/.env`); full smoke tests + controlled write test + workers validated in firebase mode (live/rich worker validation pending a real match); backup + rollback runbooks; QA_E9 data cleaned. Committed default still prisma; Prisma not removed.
12. ✅ E9.1 — Live worker validation runbook + attempt: live worker / pattern worker / resolution worker ran clean in firebase mode, but **no live rich match was available** in the window → rich alerting validation honestly PENDING (no fake alert). Backup/export + index deploy PENDING (no gcloud/Firebase CLI). QA_E9.1 cleaned.
13. ✅ E9.2 — Observe-only live validation watcher (`watchLiveValidationWindow.mjs`) + GO/NO-GO gate; backup + index deploy execution-status docs. Watcher smoke-tested (NO_LIVE_FIXTURES, no fake data). Decision: **NO-GO** for cutover until live-rich + backup + index gates close.
14. E10 (future) — Close live-rich/backup/index gates, flip the deploy-env default, approved data migration, then remove Prisma.

## Repository Layer (E1)

```
backend/src/repositories/
  contracts.ts            # persistence-agnostic interfaces
  index.ts                # createRepositories() factory
  prisma/
    prismaRepositories.ts # Prisma adapters (all 8 repos)
  firebase/
    firebaseProviderHealth.repository.ts  # first Firestore adapter (E1)
    firebaseTelegram.repository.ts        # Telegram channels + deliveries (E2)
    firebasePattern.repository.ts         # Patterns (E3)
    firebaseAlert.repository.ts           # Alerts (E3)
    firebaseAlertResolution.repository.ts # Alert resolutions (E3)
    firebaseFixture.repository.ts         # Fixtures (E4)
    firebaseLiveSnapshot.repository.ts    # Live snapshots (E4)
    firebaseOdds.repository.ts            # Odds snapshots + alert contexts (E5)
    firebasePerformance.repository.ts     # Incremental performance counters (E6.2)
```

`PERSISTENCE_PROVIDER` env selects the implementation:
- `prisma` (default) → requires `DATABASE_URL`
- `firebase` → requires Firebase creds, no `DATABASE_URL`

## E2 — Firebase Migration: ProviderHealth + Telegram

Migrated to run through `createRepositories()` (provider-agnostic):
- `liveMonitor.service.ts` → `recordProviderHealth` uses `repos.providerHealth`
- `liveMonitor.routes.ts` → `/provider-health` uses `repos.providerHealth.listRecent()`
- `telegram.service.ts` → channels CRUD, deliveries, `sendAlertToChannel`, `getApprovalQueue`, `ignoreAlertInQueue` use `repos.telegram`
- `telegramChannelRules.service.ts` → uses `repos.telegram`

Firestore adapter (`firebaseTelegram.repository.ts`):
- Collections: `telegramChannels`, `signalDeliveries`
- Deterministic delivery id `${alertId}__${channelId}` → idempotent writes (`set` with merge), no duplicate deliveries
- `findRecentDeliveryByChannel` / `countSentDeliveries` filter in-memory after a status-scoped query (acceptable at current volume; revisit with composite indexes if needed)

**E2 limitation (firebase mode):** _Resolved in E3._ `sendAlertToChannel` and `getApprovalQueue` now read alerts via `FirebaseAlertRepository`, so they work in firebase mode for alerts present in Firestore. See `FIREBASE_PATTERNS_ALERTS_MIGRATION.md`.

## What E1 Does NOT Do

- Does not migrate workers to Firebase
- Does not migrate all services to repositories (services still use Prisma directly for now)
- Does not delete the Prisma schema
- Does not migrate data
- Does not change production behaviour (default stays `prisma`)

## Firestore Collection Plan (future)

| Prisma Model | Firestore Collection | Notes |
|-------------|---------------------|-------|
| Pattern | patterns | ✅ migrated in E3 (soft-delete via status='archived') |
| Alert | alerts | ✅ migrated in E3; index on patternId, fixtureId, status, duplicateSignature |
| AlertResolution | alertResolutions | ✅ migrated in E3; deterministic id = alertId (1:1) |
| Fixture | fixtures | ✅ migrated in E4; deterministic id `provider__providerFixtureId` |
| LiveSnapshot | liveSnapshots | ✅ migrated in E4; auto id, indexed by fixtureId + capturedAt |
| ProviderHealth | providerHealth | ✅ migrated in E1 |
| TelegramChannel | telegramChannels | ✅ migrated in E2 |
| SignalDelivery | signalDeliveries | ✅ migrated in E2; deterministic id `${alertId}__${channelId}` |
| OddsSnapshot | oddsSnapshots | ✅ migrated in E5; auto id, point-in-time history |
| AlertOddsContext | alertOddsContexts | ✅ migrated in E5; deterministic id `alertId__marketType` |
| (derived) | patternPerformanceCounters | ✅ E6.2 incremental counters; doc per pattern + `performanceCounterProcessed/{alertId}` markers |

## Limitations

- Performance analytics aggregations will need denormalized counters in Firestore
- Firestore read costs require pagination/caching discipline
- Workers still depend on Prisma until later phases
