# Firebase Worker Runtime Migration + Odds Repository Alignment (Phase E5)

Phase E5 migrates the Command Center **workers** (Pattern Evaluation, Alert
Resolution) and the **Odds** module off direct Prisma usage and onto the
repository layer. With this, both workers can run in `PERSISTENCE_PROVIDER=firebase`.

Prisma remains the default and is unchanged in behaviour. Only **Performance
analytics** still uses Prisma directly (deferred to E6).

## Remaining direct-Prisma audit (before E5)

| File | Prisma models | Operations | Repository equivalent | Status |
|------|--------------|-----------|----------------------|--------|
| `command/backendDuplicateGuard.service.ts` | Alert | findFirst (signature, pattern+fixture) | `alerts.findByDuplicateSignature`, `alerts.findRecentByPatternFixture` | ✅ migrated E5 |
| `command/commandEvaluation.service.ts` | Pattern, Fixture, LiveSnapshot, Alert | findMany, findFirst, create | `patterns.listActive`, `fixtures.listLive`, `liveSnapshots.findLatestByFixture`, `alerts.create` | ✅ migrated E5 |
| `command/alertResolution.service.ts` | Alert, AlertResolution, LiveSnapshot | findMany, findFirst, $transaction | `alerts.listPending`, `alertResolutions.findByAlertId`, `liveSnapshots.findAfter`, `alertResolutions.resolveAlert` | ✅ migrated E5 |
| `odds/odds.service.ts` | Fixture, Alert, OddsSnapshot, AlertOddsContext | findUnique, findMany, create, findFirst | `fixtures.findById`, `alerts.findById`, `odds.*` | ✅ migrated E5 |
| `odds/oddsCoverageAudit.service.ts` | Fixture | findUnique, findMany | `fixtures.findById`, `fixtures.listLive` | ✅ migrated E5 |
| `odds/odds.routes.ts` (live-feasibility probe) | Fixture | findUnique | `fixtures.findById` | ✅ migrated E5 |
| `telegram/telegram.routes.ts` (rules PATCH, eligibility GET) | TelegramChannel, Alert, SignalDelivery | findFirst, findMany, update | `telegram.*`, `alerts.findById` | ✅ migrated E5 |
| `workers/patternEvaluation.worker.ts` | — (no direct Prisma) | calls service | — | ✅ runs via repo-backed service |
| `workers/alertResolution.worker.ts` | — (no direct Prisma) | calls service | — | ✅ runs via repo-backed service |
| `repositories/prisma/prismaRepositories.ts` | all | all | — | ✅ intentional (the Prisma adapter) |
| `performance/performance.service.ts` | Alert, AlertResolution, Pattern | findMany, count (aggregations) | — | ⏳ deferred to E6 |

## Workers

Neither worker imports Prisma — they only orchestrate the services:
- `patternEvaluation.worker.ts` → `runPatternEvaluation()` (now repo-backed)
- `alertResolution.worker.ts` → `resolvePendingAlerts()` (now repo-backed)

Worker status, logs, backoff, and the `*_WORKER_ENABLED=false` defaults are
unchanged. Because the services are repository-backed, both workers now run in
firebase mode without Postgres.

## Precision / safety guarantees preserved

The evaluation and resolution logic is **unchanged** — only the persistence
calls were swapped. Specifically still enforced:

- Hard gates (P/PEN/FT blocked, non-live blocked, `suggest_only`/`highlight`
  blocked, `requireRichData`, critical-vs-poor-data) — untouched.
- Confidence calculation, momentum source weighting, signal states — untouched.
- Duplicate guard: signature window + pattern+fixture window (blocks pending and
  unknown spam) — same behaviour via `alerts.findByDuplicateSignature` /
  `alerts.findRecentByPatternFixture`.
- Resolution: snapshots before the trigger are not counted
  (`liveSnapshots.findAfter(fixtureId, createdAt)`), events outside the window
  are not counted, shootout is ignored, double-counting fix preserved (events
  read from the last snapshot only), **`unknown` never becomes `failed`**.
- Resolution idempotency: the race-condition guard (`alertResolutions.findByAlertId`)
  plus the deterministic resolution doc id (`= alertId`) prevent duplicate
  resolutions. `resolveAlert` updates `alert.status` + writes the resolution
  atomically (Firestore batch / Prisma `$transaction`).

### Date tolerance

Repositories return dates as `Date` (Prisma) or ISO strings (Firebase). Migrated
services coerce defensively:
- `commandEvaluation`: `toDate(snapshot.capturedAt)` for freshness; `buildPatternInput`
  accepts `Date | string`.
- `alertResolution`: `toDate(alert.createdAt)` for age + `findAfter` cutoff.
- `odds.service`: `toDate` / `toIso` for snapshot `capturedAt` staleness + market mapping.

## Odds repository (Firestore)

`backend/src/repositories/firebase/firebaseOdds.repository.ts`

Collections:
- `oddsSnapshots/{autoId}` — immutable point-in-time records, history preserved.
  Only provider-returned odds are stored (no fabricated odds). `rawJson` kept as
  provided. `capturedAt` normalized to ISO.
- `alertOddsContexts/{alertId}__{marketType}` — deterministic id → one context
  per (alert, market). `set(merge)` keeps it idempotent.

| Method | Strategy |
|--------|----------|
| createSnapshot | auto id; Date → ISO; history preserved |
| listRecentSnapshots | `where fixtureId == …` + in-memory sort `capturedAt` desc + slice |
| findAlertOddsContext | doc get on deterministic id |
| createAlertOddsContext | `set(merge)` on deterministic id |

`PrismaOddsRepository` implements the same contract (unchanged). Odds disabled
(`ODDS_ENABLED=false`) continues to short-circuit before any persistence.

## Recommended Firestore indexes (production scale)

- `oddsSnapshots`: `fixtureId` ASC, `capturedAt` DESC

(Plus the fixtures/alerts/snapshots indexes documented in the E3/E4 migration
docs.)

## Limitations after E5

- **Performance analytics** (`performance.service.ts`) still uses Prisma
  aggregations (`count`, grouped `findMany`) and requires
  `PERSISTENCE_PROVIDER=prisma`. Firestore re-modeling with denormalized counters
  is E6.
- **No data migration** has been performed; firebase mode starts from empty
  collections.
- **Full firebase runtime** depends on real Firebase credentials and populated
  collections; this phase validates typecheck + build and the repository wiring.

## Verification

Backend: `npm run db:generate` (local binary, not `npx prisma`), `npm run typecheck`, `npm run build` — all pass.
Frontend: `npm run check:encoding`, `npx tsc --noEmit`, `npx vite build` — all pass.
