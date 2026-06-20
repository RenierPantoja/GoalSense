# Live Pipeline Guard Integration — Audit (Phase B31)

> Pre-integration map of the **real** live data pipeline, so the B30 guards can be
> wired into the actual provider/snapshot/worker paths without destabilizing
> B12–B30. No guard is integrated without this map.

## 1. Real flow (as-is, before B31)

```
liveMonitor.worker.ts (interval loop, LIVE_WORKER_ENABLED)
  └─ runOnce()
       ├─ fetchEspnLiveFixtures()            ← PROVIDER CALL #1 (scoreboard, all leagues)
       │      providers/espn.provider.ts
       ├─ recordProviderHealth() (non-blocking)
       └─ processLiveFixtures(fixtures)       ← modules/live/liveMonitor.service.ts
            ├─ selectFixturesForEnrichment()  ← caps enrichment to SUMMARY_ENRICHMENT_MAX_FIXTURES
            └─ for each fixture:
                 ├─ upsertFixture(pf)         ← repos.fixtures.create/update
                 ├─ fetchEspnSummary(id)      ← PROVIDER CALL #2 (per eligible fixture)
                 ├─ extractEspnStats / extractEspnTimedEvents
                 └─ captureLiveSnapshot()
                      ├─ repos.liveSnapshots.findLatestByFixture()  ← READ
                      ├─ shouldStoreSnapshot() (legacy change gate)
                      └─ repos.liveSnapshots.create()               ← WRITE (snapshot)
```

### Provider call sites
| Call | File | Function | Frequency |
|------|------|----------|-----------|
| Scoreboard (all leagues) | `providers/espn.provider.ts` | `fetchEspnLiveFixtures()` | once per worker run |
| Summary (per fixture) | `providers/espn.provider.ts` | `fetchEspnSummary(eventId)` | per enriched fixture per run |

### Fixture loading
- `processLiveFixtures(fixtures)` iterates over **every** fixture returned by the
  scoreboard (no cap on the persistence loop; only enrichment is capped).

### Snapshot write path
- Single write site: `captureLiveSnapshot()` → `repos.liveSnapshots.create()`.
- Gate today: `shouldStoreSnapshot()` (first / status / score / minute / new-events).
  No min-interval throttle, no per-match cap, no dedup hash.

### Alert dependence on snapshots
- Alert evaluation (`commandEvaluation.service.ts`, pattern worker) reads live
  state via snapshots/match context, but **alerting is not coupled to whether a
  given snapshot was persisted** — a skipped snapshot does not fail evaluation.
- Alert **resolution** (`alertResolution.service.ts`) reads outcomes/fixtures, not
  the raw snapshot write path.

### Backtest / replay readers
- `backtest.routes.ts` / backtest+replay services read **persisted snapshots**
  via `repos.liveSnapshots.findAfter()` / `listRecent()`. Therefore snapshot
  retention and over-aggressive dedup can degrade replay granularity — must be
  conservative.

### Repository delete capability
- `LiveSnapshotRepository` (contracts.ts) exposes `findLatestByFixture`,
  `findAfter`, `listRecent`, `create`. **There is no delete method.** Firebase and
  Prisma implementations are append-only. → Retention (B31) ships as a **dry-run
  plan only**; real deletion requires a future safe delete method on all three
  backends (Firebase, Prisma, Noop).

## 2. Safe-to-skip vs must-not-block

| Operation | Safe to skip / block? | Rationale |
|-----------|----------------------|-----------|
| Scoreboard provider call | Yes (budget) | Missing one run = stale data, not a failure. `dataAvailability=budget_blocked`. |
| Summary provider call | Yes (budget) | Enrichment is best-effort; base snapshot still possible. |
| Snapshot write (duplicate / interval / cap) | Yes | Nothing relevant changed; replay keeps the meaningful ones. |
| Snapshot write (score/status/event change) | **No — must pass** | Replay/backtest evidence; alerts may need the evidence. |
| Fixture beyond local cap | Yes (skip) | Local runs do not observe infinite leagues; surfaced as `fixture_cap_exceeded`. |
| Alert evaluation / resolution | **No — never gated by these guards** | Correctness of B12–B25 must be preserved. |
| Backtest / replay reads | **No — never gated** | Historical honesty must be preserved. |

## 3. Metrics without log spam
- All guard counters are **in-memory, per-process** (reset on restart) — same model
  as B30. Surfaced via `GET /api/system/local-operations/guard-metrics`.
- Logging is **rate-limited** (≥30s per distinct event key) and gated by
  `ENABLE_LOCAL_OPS_GUARD_LOGGING`. No payloads, no tokens, no secrets.

## 4. Integration decision (gradual)
- New flags default **observe / off** so B12–B30 behavior is byte-for-byte
  unchanged until an operator opts in (`LOCAL_OPS_GUARD_MODE=enforce` +
  `ENABLE_*_GUARD=true`).
- `ENABLE_LIVE_FIXTURE_CAP=true` by default (cheapest, safest guard; only affects
  local over-collection, never historical data).
- Precedence: explicit `LOCAL_OPS_GUARD_MODE` always wins; `LOCAL_RUNTIME_PROFILE`
  only provides a **recommended** mode (`safe_local`→observe, `live_validation`→enforce,
  `intensive_debug`→observe).

## 5. Files touched by B31
- `env.ts` (flags), `modules/localops/livePipelineGuard.service.ts` (new),
  `modules/localops/snapshotRetention.service.ts` (new),
  `modules/localops/utils/localOps.util.ts` (pure helpers: guard mode + retention),
  `modules/live/liveMonitor.service.ts` (fixture cap + summary budget + snapshot guard),
  `workers/liveMonitor.worker.ts` (scoreboard budget),
  `modules/localops/dataCoverageMonitor.service.ts` (guard metrics),
  `modules/localops/workerRegistry.service.ts` (guard runtime summary),
  `modules/localops/localOperations.routes.ts` (guard-metrics + retention routes),
  `modules/localops/snapshotWriteGuard.service.ts` (commitWrite/registerSkip),
  `modules/localops/providerUsageGuard.service.ts` (finer operation taxonomy),
  frontend `localOperationsTypes.ts` / `localOperationsApi.ts` / `LocalOperationsPanel.tsx`,
  `scripts/smokeLivePipelineGuards.mjs` (new).
