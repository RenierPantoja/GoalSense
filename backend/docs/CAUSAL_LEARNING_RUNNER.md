# Causal Learning Runner (B48 / Bloco 5)

`causal/causalLearningRunner.service.ts`. Manual-first orchestration that builds cases,
generates insights, derives calibration suggestions, persists everything and emits
observational LearningEvents. Scheduler OFF by default. Non-fatal; under Noop returns empty.

## Entry points
- `runCausalLearningForFixture(fixtureId)`
- `runCausalLearningForToday()` (capped by `CAUSAL_LEARNING_MAX_FIXTURES_PER_RUN` / `_MAX_CASES_PER_RUN`)
- `runCausalLearningForAlert(alertId)`
- `runCausalLearningForGovernanceResult(resultId)`
- `rebuildCausalLearningCases(scope)`

## LearningEvent integration (observational)
Emits (source `causal_learning`): `causal_case_created`, `causal_insight_created`,
`governance_calibration_suggested`, `influence_calibration_suggested`,
`causal_learning_run_completed`. These never auto-tune B13/B24 and never count as
statistical truth.

## Guarantees
Does not change runtime/score/confidence/patterns/alert results/enforce; does not block
alerts; does not send Telegram; suggestions require human review.
