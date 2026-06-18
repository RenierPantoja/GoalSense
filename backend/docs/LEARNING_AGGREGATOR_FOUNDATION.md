# Learning Aggregator + Context Intelligence Profiles (Phase B13)

Turns the B12 memory into **aggregated, queryable intelligence**. Deterministic
and honest: no ML, no auto-tuning of patterns, no confidence changes at runtime,
no invented data, no odds.

> `unknown` is never a failure · `confirmed_partial` counts as partial usefulness
> · rates are computed over RESOLVED alerts only · small samples are gated.

## What it answers
- Which radar performs best (by useful rate)?
- In which league / minute window does a pattern work more?
- Does this team confirm more signals at home vs away?
- Is `unknown` high because of missing data (provider gap), not a pattern failure?
- Which context has insufficient sample to conclude anything?

## Contracts (`contracts/learning.types.ts`)
`PatternLearningProfile`, `CompetitionLearningProfile`, `TeamLearningProfile`,
`MinuteWindowLearningProfile`, `SignalContextStats`, `LearningAggregationRun`,
`LearningRecommendation`, `ContextBreakdownSample`, `SampleQuality`,
`OutcomeDistribution`, `LearningOverview`.

## Metrics & definitions (`learning/learningStats.util.ts`)
- `resolvedCount` = confirmed + confirmed_partial + failed + unknown + expired (pending excluded).
- `usefulCount` = confirmed + confirmed_partial · `usefulRate` = useful / resolved.
- `failedRate` = **failed / resolved** (unknown is **not** in the numerator).
- `unknownRate` = (unknown + expired) / resolved (explicit, no-data grouped).
- `sampleQuality` over the resolved sample: `<5 insufficient · 5–14 low · 15–39 moderate · ≥40 strong`.

## Aggregation (`learning/learningAggregator.service.ts`)
Reads all ledger entries + outcomes + failures, joins by `alertId`, and folds each
joined record into:
- **Pattern profiles** (best/worst competitions, best/worst minute windows, top failure reasons, data-quality breakdown).
- **Competition profiles** (most useful / most failing patterns, strong minute windows, `competitionType` heuristic source).
- **Team profiles** (overall + home/away split + home/away useful rate + top failure reasons).
- **Context stats** (competition type, importance, data quality, minute window, provider, score state).

All recomputed from raw records → idempotent. `aggregateAll()`,
`aggregatePattern(id)`, `getLearningOverview()`. Helpers:
`minuteWindow.util.ts`, `contextKey.util.ts` (deterministic, accent-insensitive).

## Recommendations (`learning/learningRecommendation.service.ts`)
Conservative and sample-aware. Types: `insufficient_sample`, `high_unknown_rate`,
`data_quality_warning`, `adjust_minute_window_candidate`,
`exclude_context_candidate`, `competition_strength_observed`,
`team_context_strength_observed`. Every recommendation carries `evidence`
(sampleSize, context, distribution, sampleQuality); strength tracks sample
quality; nothing is auto-applied. Insufficient samples yield only an
`insufficient_sample` note.

## Aggregation learning events
On a real (non-dry) run, the aggregator writes **deterministic** learning events
(id `lrn_agg_${recId}`) for the strongest signals only (skips low-strength /
small-sample), so re-runs don't spam duplicates.

## Persistence (Repository Layer)
`IntelligenceRepository` extended with bulk reads (`listAll*`) and learning
persistence (`upsert*Profile`, `*SignalContextStats`, `*LearningRecommendation`,
`*LearningAggregationRun`). Firestore collections: `patternLearningProfiles`,
`competitionLearningProfiles`, `teamLearningProfiles`, `signalContextStats`,
`learningRecommendations`, `learningAggregationRuns`. Deterministic ids → upserts
are idempotent. **Firebase mode persists; Prisma mode uses the Noop adapter**
(reads empty, writes accepted without persistence) — Prisma fallback intact, no
`DATABASE_URL` required in Firebase mode.

## API (`modules/intelligence/learning.routes.ts`, prefix `/api`)
- `GET /intelligence/learning/overview`
- `GET /intelligence/learning/patterns` · `/patterns/:patternId`
- `GET /intelligence/learning/competitions` · `/competitions/:competitionKey`
- `GET /intelligence/learning/teams` · `/teams/:teamKey`
- `GET /intelligence/learning/context-stats`
- `GET /intelligence/learning/recommendations`
- `POST /intelligence/learning/rebuild` (body `{ patternId?, dryRun? }`)

Honest emptiness (null/[] with 200). The B12 read endpoints are untouched.

## Job / smoke
- `node scripts/runLearningAggregation.mjs [--pattern=<id>] [--dry-run]` — manual recompute.
- `node scripts/smokeLearningAggregator.mjs` — pure, in-memory (no env/Firebase): minute bucketing, context keys, distribution + rates (unknown excluded from failedRate), sample-quality gate, recommendation sample gate, Noop adapter safety. ✓

## Real limitations (honest)
- **POST /rebuild is unprotected** (no admin/auth layer yet) — restrict at the
  edge or add auth before public exposure. It is idempotent and non-destructive.
- **No scheduled job** — aggregation is manual (script/endpoint) this phase.
- **Prisma mode does not persist** profiles (Noop) — Firebase mode does.
- **Competition type/stage/importance are heuristic** (from competition name) —
  competition profiles tag `source: heuristic`.
- **Provider** is inferred from `dataAvailability.liveScore.source` (usually `espn`).
- **Time-to-resolution** is wall-clock (`outcome.timeToResolutionMinutes`), not exact match minute.
- Recommendations are **observations only** — nothing auto-tunes patterns or confidence.
- Pre-match / H2H / standings / lineups / xG / odds remain out of scope (still `unavailable`).

## Next steps toward backtest
- Scheduled aggregation worker (env-gated) + incremental updates.
- Replay over the ledger to simulate alternative thresholds (offline).
- Per-team/league/minute confidence calibration proposals (still human-approved).
