# Local Validation Metrics (B49 / Bloco 6)

`validation/localValidationMetrics.service.ts`. Builds honest reliability/coverage/cost/
readiness/go-no-go reports for a run, separating failure from limitation and not_evaluable.

## Reliability
fixturesAnalyzed, fixturesWithSufficientData, fixturesProviderLimited, governance
evaluations (wouldAllow/Monitor/Wait/Block), holds, outcomesResolved, causalCasesCreated/
Evaluable/NotEvaluable, governanceAligned/TooStrict/TooLoose, data/provider limitation counts.
`unknown` is never counted as failed; `not_evaluable` and provider limitation are separate.

## Coverage
providerCoverageByDomain + per-domain coverage percentages (lineup/injury/suspension/
standings/h2h/squad/live/post-match/evidence/exact-link/weak-link).

## Cost
providerCalls (0 in the validation core), Firestore reads/writes estimated, snapshots,
cache hits/misses, duration, warnings.

## Go/No-Go
localBackendStatus (go / go_with_warnings / no_go / insufficient_data) and commercialReadiness
(conservative: never `beta_candidate` automatically; requires provider + Firebase + real
history). Reasons/blockers/warnings/requiredFixes/recommendedNextSteps included.

A metric is data confidence, NOT a promise of future accuracy.
