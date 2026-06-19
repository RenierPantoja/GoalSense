# Auto Engine Learning & Calibration (Phase B24)

A SEPARATE, observational learning layer for the Auto Engine, built from the closed B22/B23
loop (manually-promoted alerts + their honest outcomes). It answers "is the Auto Engine getting
calibrated or just generating noise?" without ever auto-tuning the engine, rewriting opportunity
scores, creating alerts, sending Telegram, or using odds. It is fully isolated from the B13
manual-pattern learning namespace.

## What it learns
- Which **opportunity types** confirm more / produce more `unknown`.
- Whether each **score band** (0-20 … 81-100) looks useful or is **possibly overestimating**.
- Which **leagues / teams / minute windows** look better (with sample-quality gating).
- Which **data qualities** raise `unknown`.
- Which **risk-gate block reasons** appear often (frequency only — blocked opps have no outcome).
- Conservative **recommendations** the engine should *consider*, never auto-apply.

## How promoted outcomes enter calibration
Join key = `opportunityId`. Each `AutoOpportunityOutcomeSummary` (resolved promoted alert) is
joined with its `AutoOpportunity` (type / score / band / league / teams / minute / dataQuality /
risk warnings) and `ManualPromotedAlertLink` (originalScore). The pure builder
`utils/autoEngineCalibration.util.ts` aggregates honest rates (reusing `learningStats.util.ts`).

## Outcome vs score (and "not probability")
The **outcome** is the posterior result of the alert the user chose to monitor; the **score** is
the engine's signal-quality estimate at scan time. B24 never rewrites the score. Rates are over
resolved promoted alerts only and are **not** a hit-rate or probability — they are observational
indicators, gated by sample quality.

## Honest handling
- `usefulCount = confirmed + confirmed_partial`; `confirmed_partial` is partial-useful.
- `failedRate` numerator = `failed` only; `unknown`/`expired` go to `unknownRate` and are **never**
  failures.
- `sampleQualityOf(resolved)`: <5 insufficient, <15 low, <40 moderate, else strong. Recommendation
  strength is gated by sample quality — small samples never produce strong/certain language.
- `dataQuality:'poor'` opportunities are blocked (never promoted) → a permanent limitation says
  they should stay blocked.
- Risk-gate blockers have **no outcome** (never promoted). The profile reports frequency and
  interprets data-integrity blockers (`data_poor`, `missing_required_data`, `too_much_unknown`,
  `provider_stale`) as `useful_blocker`; others as `insufficient_sample`.

## Modules
- `autoEngine/autoEngineLearning.types.ts` — contracts.
- `autoEngine/utils/autoEngineCalibration.util.ts` — PURE builder + score bucketing + calibration.
- `autoEngine/autoEngineLearningAggregator.service.ts` — `rebuildAutoEngineLearningProfiles(opts)`:
  loads links + summaries + opportunities, joins, builds, persists run/profile + observational
  learning events (`source:'auto_engine_calibration'`). Idempotent; never mutates source data.
- `autoEngine/autoEngineCalibration.service.ts` — read-side overview + latest profile / type
  profile / recommendations.
- `autoEngine/autoEngineLearningScheduler.service.ts` — disabled by default; wired in `server.ts`.

## Persistence (Firebase real, Noop empty/no-throw)
Collections `autoEngineLearningRuns`, `autoEngineLearningProfiles`. Repo methods:
`createAutoEngineLearningRun`, `getAutoEngineLearningRun`, `listAutoEngineLearningRuns`,
`upsertAutoEngineLearningProfile`, `getLatestAutoEngineLearningProfile`,
`getAutoOpportunityTypeProfile`, `listAutoEngineLearningRecommendations`. **No B13 collection is
touched.**

## Flags
| Flag | Default | Effect |
|------|---------|--------|
| `ENABLE_AUTO_ENGINE_LEARNING_REBUILD` | `false` | Gates `POST …/learning/rebuild` (403 when off). |
| `ENABLE_AUTO_ENGINE_LEARNING_SCHEDULER` | `false` | Enables the periodic recompute (never in tests). |
| `AUTO_ENGINE_LEARNING_INTERVAL_MS` | `3600000` | Scheduler interval (min 60s). |

## Routes
- `POST /api/intelligence/auto-engine/learning/rebuild` (env-gated; `{ dryRun?, from?, to? }`).
- `GET  /api/intelligence/auto-engine/learning/profile`
- `GET  /api/intelligence/auto-engine/learning/runs` · `…/runs/:runId`
- `GET  /api/intelligence/auto-engine/learning/opportunity-types/:type`
- `GET  /api/intelligence/auto-engine/learning/recommendations`
- `GET  /api/intelligence/auto-engine/calibration/overview`
All GETs return honest empty/null when there is no data. No auth layer yet (documented).

## Learning events (observational, `source:'auto_engine_calibration'`)
`auto_engine_calibration_rebuilt`, `auto_engine_opportunity_type_positive_signal`,
`auto_engine_opportunity_type_high_unknown`, `auto_engine_score_bucket_insufficient_sample`,
`auto_engine_data_quality_limitation`, `auto_engine_risk_gate_observation`. Only medium/high
recommendations emit per-rec events; one rebuild marker is always emitted. Never auto-applied.

## Script
`node scripts/runAutoEngineLearningAggregation.mjs --dry-run | --persist [--from=YYYY-MM-DD --to=YYYY-MM-DD]`.
Dry-run computes and persists nothing; `--persist` writes. Logs sample size, useful/unknown rates,
top opportunity types, and top limitations.

## Limitations (honest, remaining)
- Calibration is **not** fed back into runtime scoring/risk-gate (observational only).
- Sample is bounded by how many alerts the user manually promoted and resolved.
- Risk-gate "correctness" cannot be proven (blocked opps have no outcome) — frequency only.
- No cross-blending with B13 pattern profiles; no time-trend charts; single-user; no route auth.

## Verification
- `npm run typecheck` ✓ · `npm run build` ✓
- `node scripts/smokeAutoEngine.mjs` ✓ · `node scripts/smokePromotedAlertResolution.mjs` ✓
- `node scripts/smokeAutoEngineLearning.mjs` ✓ (bucketing, unknown≠failed, sample gating, Noop)
