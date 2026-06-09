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
2. E2 — Migrate simple modules (Telegram channels, ProviderHealth) to Firestore behind the factory
3. E3 — Migrate Fixtures + LiveSnapshots (high volume; needs read-cost discipline)
4. E4 — Migrate Patterns + Alerts + Resolutions
5. E5 — Re-model Performance analytics for Firestore (denormalized counters)
6. E6 — Remove Prisma once all adapters exist and are validated

## Repository Layer (E1)

```
backend/src/repositories/
  contracts.ts            # persistence-agnostic interfaces
  index.ts                # createRepositories() factory
  prisma/
    prismaRepositories.ts # Prisma adapters (all 8 repos)
  firebase/
    firebaseProviderHealth.repository.ts  # first Firestore adapter
```

`PERSISTENCE_PROVIDER` env selects the implementation:
- `prisma` (default) → requires `DATABASE_URL`
- `firebase` → requires Firebase creds, no `DATABASE_URL`

## What E1 Does NOT Do

- Does not migrate workers to Firebase
- Does not migrate all services to repositories (services still use Prisma directly for now)
- Does not delete the Prisma schema
- Does not migrate data
- Does not change production behaviour (default stays `prisma`)

## Firestore Collection Plan (future)

| Prisma Model | Firestore Collection | Notes |
|-------------|---------------------|-------|
| Pattern | patterns | doc per pattern, userId field |
| Alert | alerts | doc per alert; index on patternId, fixtureId, status, duplicateSignature |
| AlertResolution | alertResolutions or subcollection of alerts | 1:1 with alert |
| Fixture | fixtures | index on canonicalKey, provider+providerFixtureId |
| LiveSnapshot | fixtures/{id}/snapshots | subcollection; high volume; TTL cleanup |
| ProviderHealth | providerHealth | ✅ migrated in E1 |
| TelegramChannel | telegramChannels | small |
| SignalDelivery | signalDeliveries | index on alertId+channelId |
| OddsSnapshot | fixtures/{id}/oddsSnapshots | subcollection |
| AlertOddsContext | alerts/{id}/oddsContext | subcollection |

## Limitations

- Performance analytics aggregations will need denormalized counters in Firestore
- Firestore read costs require pagination/caching discipline
- Workers still depend on Prisma until later phases
