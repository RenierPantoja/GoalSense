# Influence Aggregator (B46 / Bloco 3)

`influence/influenceAggregator.service.ts` — PURE. Combines per-variable assessments into
one operational reading.

## Logic
- **blocking dominates** → band `blocked`;
- **wait** dominates when temporal/critical data is missing;
- contradiction reduces strength; supportive-with-weak-sample never becomes strong;
- strong positive + strong negative → `mixed`; critical absence → `insufficient_data`;
- low reliability lowers `confidenceOfAssessment`.

## Net influence band
`strongly_supportive | supportive | mixed | weak | contradictory | blocked |
insufficient_data | unknown`.

## influenceScore
Internal operational weight (magnitude × reliability factor, minus blockers/waits),
centered near 0. **NOT a probability of winning.**

## confidenceOfAssessment
`high | medium | low | unknown` — confidence in the ASSESSMENT (driven by data
completeness and usable-assessment count), not in the match result.

## Conflict engine (`variableConflictEngine.service.ts`)
Surfaces conflicts so they are never resolved silently: provider_vs_manual,
memory_vs_lineup, h2h_vs_context, pattern_vs_missing_provider, probable_vs_confirmed_lineup,
memory_vs_recent_sample, stale_domain_vs_recent_manual — each with a recommended advisory
action (operator_review / wait / use_manual_high_reliability / downgrade / stay_out /
live_confirmation). It never blocks the real alert engine.

## API
`aggregateInfluences`, `buildNetInfluenceBand`, `detectBlockers`, `detectWaitReasons`,
`detectContradictions`, `buildInfluenceSummary`.
