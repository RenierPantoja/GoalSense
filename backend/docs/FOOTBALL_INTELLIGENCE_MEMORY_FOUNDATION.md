# Football Intelligence Memory — Foundation (Phase B12)

The first professional foundation for GoalSense as a **continuous football
intelligence engine**. This phase does **not** add machine learning, does not
promise accuracy, and does not invent data. It builds the **structural memory**
so future phases can learn from patterns, hits, failures, near-misses, contexts
and per-team/league/minute performance.

> Zero mock · zero invented data · zero fake ML · zero auto-bet · zero odds ·
> `unknown` is never `failed`.

## Vision

Today the engine detects signals and records alerts. After B12 it also builds a
**Signal Ledger** and a **Football Intelligence Memory** — the substrate for
future backtests, match replay, per-league/team/home-away/minute learning,
failure analysis, radar-improvement suggestions and a richer pre-match API.

## Components

### 1. Canonical types (`modules/intelligence/contracts/intelligence.types.ts`)
Professional contracts for data we have **today** and data we will have **later**
(rich pre-match, H2H, standings, lineups, odds). Every forward-looking field
accepts `unknown`/`null`; derived values carry `source` + `confidence`; absent
data carries a `DataAvailability` with an `unavailableReason`.

### 2. Signal Ledger (`memory/signalLedger.service.ts` + repo)
One traceable entry per emitted alert (`signalStatus: alerted → resolved`).
Deterministic id `led_${alertId}` → idempotent, never duplicated. Captures radar,
fixture, league, teams, minute, score, confidence, severity, evidence, scope
decision, match context and the data-availability map.

### 3. Signal Evidence Snapshot (`explainability/signalExplainability.service.ts`)
The engine's "mental photo" at signal time: evaluated/passed/failed conditions,
signal vs eligibility split, blockers, live stats actually used, recent events,
scope/context reasons, provider quality and — crucially — **what data was
missing**. Never invents stats or events.

### 4. Alert Outcome Record
One record per resolved alert: `result` (`pending | confirmed |
confirmed_partial | failed | unknown | expired`), resolution type, time to
resolution, what confirmed / what failed / what was missing, data quality at
resolution. `unknown` and `confirmed_partial` are preserved as first-class — never
coerced to failure.

### 5. Failure Analysis (`learning/learningEvent.service.ts`)
Deterministic, honest diagnosis — only when an alert truly `failed`. Reasons are
drawn from evidence (`missing_required_data`, `data_poor`, `weak_momentum`,
`random_outcome_possible`, …) and always phrased as possibilities, with a
conservative `confidenceInDiagnosis`. No invented causality; `unknown` when thin.

### 6. Missed Opportunity (`learning/missedOpportunity.service.ts`)
Architecture-ready, deliberately conservative: produces a record only when a
concrete near-miss is supplied. With no near-miss scanner yet, nothing false is
ever recorded. **Better none than false.**

### 7. Learning Events
Observation trail (`alert_created`, `alert_confirmed`, `alert_failed`,
`alert_unknown`, `alert_confirmed_partial`, …). They **never** auto-tune patterns
or confidence in this phase — they only leave a trail for a future aggregator.

### 8. Data Availability (`utils/dataAvailability.util.ts`)
`markAvailable` / `markUnavailable` / `inferProviderQuality` /
`buildLiveAvailabilityMap` / `collectMissingData`. `0` only when the provider
reported zero; absence stays `null` + `unavailable` with a reason. The future
base is never contaminated with fake data.

## Persistence (Repository Layer)

`IntelligenceRepository` added to the central contract + factory:
- **Firebase mode** (primary/staging): `FirebaseIntelligenceRepository` persists
  `signalLedger`, `alertOutcomes`, `signalFailures`, `missedOpportunities`,
  `learningEvents`. Deterministic ids, merge writes, in-memory sort, capped reads.
- **Prisma mode** (fallback): `NoopIntelligenceRepository` implements the full
  contract without persistence (no new Prisma models this phase). Prisma mode
  keeps working; memory simply isn't stored there (logged once). No
  `DATABASE_URL` is required in Firebase mode.

## Lifecycle integration (non-blocking, never throws)

- **Creation** — `commandEvaluation.service.ts → runPatternEvaluation`: after the
  alert is created, `recordAlertCreated()` writes the ledger entry + evidence +
  `alert_created` learning event. Wrapped in try/catch; cannot affect alert
  creation, `maxTriggersPerMatch`, scope filtering, dedupe or Telegram.
- **Resolution** — `alertResolution.service.ts → resolvePendingAlerts`: after
  `resolveAlert(...)`, `recordAlertResolved()` writes the outcome, transitions the
  ledger to `resolved`, creates a `SignalFailureAnalysis` only when `failed`, and a
  learning event. `unknown` stays `unknown`.

## Read API (`modules/intelligence/intelligence.routes.ts`, prefix `/api`)
- `GET /intelligence/alerts/:alertId/ledger`
- `GET /intelligence/alerts/:alertId/outcome`
- `GET /intelligence/patterns/:patternId/ledger`
- `GET /intelligence/patterns/:patternId/outcomes`
- `GET /intelligence/patterns/:patternId/learning-events`
- `GET /intelligence/overview`

Honest emptiness: absence returns `null`/`[]` with 200, never 500. Lists are
capped and newest-first. The Command Center "Alertas" tab can evolve on top of
this without gambiarra.

## How this prepares the future
- **Backtest / replay**: every signal + outcome is now recorded with the exact
  evidence and data-availability at the time → replayable, measurable.
- **Per-context learning**: ledger carries league/teams/minute/competition
  type/stage → future aggregation by any dimension.
- **Richer API**: the `DataAvailability` seams (xG, pre-match, H2H, standings,
  lineups, odds) are already marked `unavailable` with reasons; future providers
  fill them in without rewriting the model.

## Validation
- `npm run typecheck` ✓ · `npm run build` ✓
- `node scripts/smokeIntelligenceMemory.mjs` ✓ (pure shape validation; `--confirm`
  does an isolated Firestore write/read/delete on a `led___smoke_test` doc).

## Real limitations (honest)
- **Prisma mode does not persist** the memory (Noop adapter) — Firebase mode does.
- **`resolutionMinute` is `null`** (exact match-minute at resolution not tracked
  yet; `timeToResolutionMinutes` is wall-clock).
- **Missed Opportunity** has no scanner yet — only the safe contract + builder.
- **Pre-match / H2H / standings / lineups / xG / odds** are all marked
  `unavailable` (no rich provider yet).
- **`momentumSource` at resolution** is recorded as `null` (the resolver doesn't
  recompute momentum); creation-time momentum is captured in the ledger evidence.
- Learning events are **observations only** — nothing auto-tunes patterns or
  confidence in this phase.


## B13 — Learning Aggregator

Phase B13 turns this memory into **aggregated, queryable intelligence**
(see `LEARNING_AGGREGATOR_FOUNDATION.md`): deterministic Pattern / Competition /
Team / context profiles, conservative sample-aware recommendations, aggregation
learning events, a read API under `/api/intelligence/learning/*`, and a manual
aggregation script (`scripts/runLearningAggregation.mjs`).

Key guarantees carried over: `unknown` is never a failure, `confirmed_partial`
counts as partial usefulness, rates are computed over resolved alerts only, small
samples are gated by `sampleQuality`, nothing auto-tunes patterns or confidence.
Firebase persists the profiles; Prisma mode uses the Noop adapter.


## B16 — Alertas 2.0 / Signal Ledger UI

Phase B16 turns the Command Center "Alertas" tab into a visual **Signal Ledger**
that consumes these B12 endpoints (`/api/intelligence/alerts/:id/ledger` and
`/outcome`) plus the B13 learning endpoints. A wide drawer explains each alert
across 5 tabs (Resumo / Evidências / Resultado / Linha do tempo / Aprendizado),
and two extra views surface pattern quality and the engine's learning feed. The
UI is read-only and honest — `unknown`/`not_evaluable` are neutral states, never
failure; missing ledger/outcome/learning render explicit empty states. See
`docs/ALERTAS_2_SIGNAL_LEDGER_UI_FOUNDATION.md`.
