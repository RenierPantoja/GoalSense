# Backtest & Replay Engine — Foundation (Phase B14)

First real foundation for testing radars against recorded history and replaying
matches as if live. **Read-only and honest**: no auto-bet, no odds, no invented
history, no real alerts, no Telegram, no pattern/confidence changes, no touching
of production counters or learning profiles.

> `unknown` ≠ `failed` · missing post-trigger data ⇒ `unknown`/`not_evaluable` ·
> `confirmed_partial` counts as partial usefulness · a goal only confirms
> goal-type signals.

## What it answers
- In which matches would this radar have fired, and at what minute?
- Which conditions matched / were missing?
- What is the *likely* outcome of the signal, given the recorded data?
- In which leagues / minute windows does it look stronger?
- Where does it fail, and what is just missing data?

## Module (`modules/intelligence/backtest/`)
- `backtest.types.ts` — contracts (`BacktestRun`, `BacktestRunConfig`,
  `BacktestSignalResult`, `BacktestTimelinePoint`, `BacktestSummary`,
  `BacktestDataCoverage`, `BacktestLimitation`, `BacktestOutcomeGuess`,
  `ReplayRun`, `ReplayDecisionPoint`).
- `backtestEvaluationAdapter.service.ts` — turns a historical fixture + snapshot
  into the SAME `PatternEvaluationInput` the live worker uses (snapshot status
  drives eligibility). Never synthesizes stats.
- `backtestEngine.service.ts` — `runPatternBacktest(config)` / `evaluateFixture`.
  Resolves fixtures (explicit ids or `listLive` over live+terminal statuses,
  filtered by date + pattern scope), walks each fixture's ordered snapshots with
  the pure evaluator, finds the first trigger, estimates outcome, builds summary
  + coverage + limitations, persists its own run/results.
- `replayEngine.service.ts` — `replayFixture(patternId, fixtureId)` → minute-by-minute
  decision points with passed/missing conditions, blockers, confidence and a
  human explanation; first trigger minute; honest outcome.
- `backtestOutcome.service.ts` — honest outcome estimation from post-trigger
  snapshots only (windows by signal type, mirroring B8). No post data ⇒
  `not_evaluable`; no events/stats ⇒ `unknown`.
- `backtestSummary.service.ts` — `usefulRate = confirmed + confirmed_partial`;
  `failedRate` excludes `unknown`/`not_evaluable`; rates over decisive outcomes;
  best/worst lists gated by `sampleQuality`.
- `utils/` — `replayTimeline.util` (chronological ordering), `backtestId.util`
  (deterministic replay ids), `backtestGuards.util` (config validation + env gate).

## Data coverage & limitations
Every run reports `BacktestDataCoverage` (fixtures found / with-snapshots /
without, snapshots evaluated, rich/partial/poor/unknown counts, provider
breakdown) and `BacktestLimitation[]` (`no_snapshots`, `no_post_trigger_data`,
`poor_data_quality`, `no_fixtures_in_scope`, `small_sample`, …) so the user knows
whether the backtest is strong or weak.

## Persistence (Repository Layer)
`IntelligenceRepository` extended: `createBacktestRun`/`update`/`get`/`list`,
`createBacktestSignalResult`/`list`, `createReplayRun`/`get`/`list`. Firestore
collections `backtestRuns`, `backtestSignalResults`, `replayRuns`. Firebase
persists; **Prisma mode uses the Noop adapter** (reads empty, writes accepted
without persistence) — Prisma fallback intact, no `DATABASE_URL` needed in
Firebase mode.

## API (`modules/intelligence/backtest.routes.ts`, prefix `/api`)
Gated by **`ENABLE_BACKTEST_API=true`** (POST + on-the-fly replay compute → 403 when off):
- `POST /intelligence/backtest/run` (body = `BacktestRunConfig`; `maxFixtures` hard-capped at 300)
- `GET  /intelligence/backtest/runs` · `/runs/:runId` · `/runs/:runId/results`
- `POST /intelligence/replay/run` (body `{ patternId, fixtureId }`)
- `GET  /intelligence/replay/runs/:runId`
- `GET  /intelligence/replay/patterns/:patternId/fixtures/:fixtureId`

GET reads of stored runs are open and honest (null/[] with 200). **No endpoint
ever creates an alert or sends Telegram.**

## Why backtest never creates an alert
Backtest/replay only run the **pure** evaluator (`evaluateCondition` /
`evaluatePatternAgainstInput`) over recorded snapshots. They never call
`repos.alerts.create`, the resolution worker, Telegram, or the performance
counters. The only writes are to the dedicated backtest/replay collections.

## Scripts
- `node scripts/runPatternBacktest.mjs --pattern=<id> [--maxFixtures=N] [--dry-run]`
- `node scripts/replayFixturePattern.mjs --pattern=<id> --fixture=<id>` (read-only)
- `node scripts/smokeBacktestReplay.mjs` — pure, in-memory (no env/Firebase):
  timeline ordering, honest outcomes (not_evaluable / confirmed / unknown / failed),
  summary rates (unknown excluded from failedRate, partial counted as useful),
  sample-quality gate, missing-condition surfacing, Noop safety. ✓

## Env flags
- `ENABLE_BACKTEST_API` (default `false`) — enables run/replay-compute endpoints.
- `ENABLE_LEARNING_AGGREGATION_SCHEDULER` (default `false`) — periodic B13 re-aggregation.
- `LEARNING_AGGREGATION_INTERVAL_MS` (default `3600000`).

## Learning Aggregation Scheduler (foundation, disabled by default)
`learning/learningAggregationScheduler.service.ts` — env-gated, never runs in
tests, in-process lock prevents overlap, `unref()`'d timer, never throws at
startup. Started from `server.ts` (no-op unless enabled). No external cron.

## Real limitations (honest)
- **Backtest quality is bounded by recorded snapshots**: fixtures the live worker
  never observed have zero snapshots → `not_evaluable` (surfaced in coverage).
- **No date-range fixture index**: candidates come from `listLive(terminalStatuses)`
  filtered in memory + capped (`maxFixtures`).
- **Outcome estimation depends on post-trigger snapshots** and provider event
  coverage; absent ⇒ `unknown`.
- **No xG / pre-match / H2H / standings / odds** (still out of scope).
- **Prisma mode does not persist** backtest/replay (Noop) — Firebase mode does.
- **POST endpoints are env-gated but not auth-protected** — add auth before public exposure.
- Scheduler is **disabled by default**; aggregation remains manual unless enabled.

## Next steps for UI
- Command Center "Backtest" tab: run config form → coverage + summary + per-fixture
  results + replay timeline viewer. The contracts and endpoints above are ready.


## B15 — Command Center Backtest Lab UI

Phase B15 adds the frontend that consumes these endpoints: a **Backtest** tab in
the Command Center (`src/features/command/components/views/backtest/`) with a
config panel, summary, data-coverage, per-fixture results (filterable) and a
wide minute-by-minute **Replay Viewer**. The client (`src/services/backtestApi.ts`)
distinguishes 403 (API disabled) from other errors and shows honest states.
See `docs/BACKTEST_LAB_UI_FOUNDATION.md`. The UI is read-only: it never creates
alerts, sends Telegram, or alters patterns/confidence — and renders `unknown` /
`not_evaluable` as distinct neutral states (never "failure").

---

## B33 note — evidence lineage (exact links)
The backtest and replay engines now emit **exact** evidence links to the snapshot
documents they actually consume (`backtest_result` / `replay_step`, gated by
`ENABLE_EVIDENCE_LINEAGE`, batched, non-fatal). These are the only sources that can
produce `exact` links today (they iterate real snapshot docs with ids), which lets
snapshot retention protect precisely the snapshots a backtest/replay depended on.
Results/timelines and outcomes are unchanged. See `EVIDENCE_LINEAGE.md`.
