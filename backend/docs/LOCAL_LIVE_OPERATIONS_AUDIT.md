# Local Live Operations — Audit (Phase B30)

Read-only map of every point that consumes the provider, writes data, or grows cost, before adding
guardrails. The product runs locally for now (cloud prepared in B28/B29 but not provisioned).

## Cost / write / provider surfaces
| Surface | What it does | Provider call | Writes | Default |
|---|---|---|---|---|
| `liveMonitor.worker` (`LIVE_WORKER_ENABLED`) | every `LIVE_WORKER_INTERVAL_MS` (30s) fetches ESPN live fixtures + summaries, processes via `processLiveFixtures` | **yes** (ESPN + summary enrichment, up to `SUMMARY_ENRICHMENT_MAX_FIXTURES`) | **snapshots** (rich/partial/poor) + provider health | off |
| `patternEvaluation.worker` (`PATTERN_WORKER_ENABLED`) | evaluates patterns over snapshots; may create alerts | no | **alerts** | off |
| `alertResolution.worker` (`RESOLUTION_WORKER_ENABLED`) | resolves pending alerts from snapshots | no | resolutions/outcomes | off |
| learning scheduler (`ENABLE_LEARNING_AGGREGATION_SCHEDULER`) | recomputes B13 profiles | no | profiles | off |
| auto-engine scheduler (`ENABLE_AUTO_ENGINE_SCHEDULER`) | live scans → opportunities (write only if `ENABLE_AUTO_ENGINE_WRITE`) | reads snapshots | opportunities | off |
| auto-engine learning scheduler (`ENABLE_AUTO_ENGINE_LEARNING_SCHEDULER`) | recomputes calibration | no | profiles | off |
| manual scripts (`runAutoEngineScan`, `runLearningAggregation`, backtest/replay) | on-demand | varies | varies | manual |

## Heavy reads / Firestore
Auto-engine overview/search read up to 200–500 opportunities; alert intelligence search loads joined
alerts; learning/backtest readers list profiles/runs. These are reads (Firestore cost) but not writes.

## Snapshot writes (the main growth vector)
`processLiveFixtures` creates a snapshot per observed fixture per run. At 30s interval with N live
fixtures that is `N * 120` snapshots/hour — the biggest local cost driver. Backtest/replay/learning
only need snapshots that capture **change** (score/minute/status/events/stats), so writing identical
snapshots every poll is wasteful.

## Dangerous flags to keep OFF locally (default off)
`ENABLE_AUTO_ENGINE_WRITE`, `ENABLE_AUTO_ALERT_CREATE`, `ENABLE_AUTO_ENGINE_TO_ALERTS`,
`ENABLE_ALERT_EXPORT` (without auth), `TELEGRAM_ENABLED`, `ODDS_ENABLED`, and all `*_WORKER_ENABLED`
/ `*_SCHEDULER`.

## B30 plan
- `LocalRuntimeProfile` (`safe_local` default) documenting recommended flag states + precedence
  (explicit env flags always win; the profile only *recommends* and the panel surfaces mismatches).
- `providerUsageGuard` (in-memory per-minute/hour counters + pure limit eval).
- `snapshotWriteGuard` (pure relevance/dedup decision + min interval + max per match).
- `dataCoverageMonitor` (observed/with-snapshot/quality/missing — unknown explicit, never failure).
- `workerRegistry` (pause/resume wrapping existing start/stop; reports unsupported pauses).
- `costEstimator` (projected writes/reads/provider-calls + risk level, no monetary price).
- Local Operations API (`/api/system/local-operations/*`, env-gated, admin for POST).
- Frontend `LocalOperationsPanel` + api/types.

## Invariants
No mock/invented data; unknown ≠ failure; snapshot skip ≠ failure; no Telegram/odds/auto-bet; no
score/confidence change; B12–B29 untouched (guards are additive services); Firebase + Noop preserved.
