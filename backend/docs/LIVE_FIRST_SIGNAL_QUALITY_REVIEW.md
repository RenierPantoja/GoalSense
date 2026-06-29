# Live-First Signal Quality Review — B68

Observe-only layer that reviews the quality of ESPN live-first signals.

## Pipeline
1. `collectRecentLiveFirstSignals()` — derives signals from persisted sessions /
   fixture states / post-match outcomes (never invents events).
2. `gradeSignalEvidence()` — strong/moderate/weak/insufficient (missing data →
   `missingEvidence`, never zero).
3. `detectMomentumNoise()` — classifies pressure as sustained / event-driven /
   score-effect / stale / low-sample / normal variance.
4. `alignSignalsWithOutcomes()` — aligned / partially / contradicted / not_evaluable / pending.
5. `deriveQualityGrade()` — reliable_observe / useful_but_limited /
   noisy_monitor_only / insufficient_data / misleading_candidate / pending_more_sample.
6. `evaluateGovernanceQuality()` — appropriate / too_aggressive / too_conservative /
   insufficient_evidence / data_limited / pending_more_sample (recommendation only).
7. `saveSignalQualityReview()` — persists cases + summary.

## Collections
- `liveFirstSignalQualityCases`
- `liveFirstSignalQualityReviews`
(Noop fallback: in-memory, warns no persistence.)

## CLI
- `runLiveFirstSignalQualityReview.mjs`
- `getLiveFirstSignalQualitySummary.mjs`

## Route
- `GET /api/worker-control-plane/signal-quality` → latest review (no-store).

## Invariants
Observe only: no calibration, no policy/threshold/score change. Momentum is a
qualitative read, not a likelihood. not_evaluable / unknown ≠ failure.
