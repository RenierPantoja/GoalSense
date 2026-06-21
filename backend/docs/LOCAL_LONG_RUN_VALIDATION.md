# Local Long-Run Validation (B49 / Bloco 6)

The final local validation layer: run the backend over a day's fixtures, measure
coverage/reliability/cost, and produce an honest go/no-go + backend health. Manual-first,
scheduler OFF, observe/shadow, never blocks alerts, never enforces, never invents data.

## Files (`modules/footballIntelligence/validation/`)
- `localValidation.types.ts` — contracts.
- `localValidationPlan.service.ts` — safe selection within local caps + cost estimate (no provider call).
- `localValidationRunner.service.ts` — non-fatal per-fixture pipeline.
- `localValidationMetrics.service.ts` — reliability/coverage/cost/readiness/go-no-go.
- `localValidationCache.service.ts` — per-run in-memory cache.
- `localLiveReevaluationBridge.service.ts` — safe flag-gated live → governance recheck.
- `decisionOutcomeLinkRepair.service.ts` — link backfill (never weak→exact).
- `providerCoverageReport.service.ts` — what's missing to improve data.
- `localBackendHealthReport.service.ts` — final health + commercial readiness.

## How to run
1. Backstage → "Validação local & saúde do backend" → "Plano" (preview selection + cost).
2. "Rodar hoje" (operator) → runs the pipeline per selected fixture.
3. Read reliability/coverage/cost + go/no-go + backend health.

## Interpreting metrics (honest)
- `unknown` / `not_evaluable` are NOT failures.
- `provider_not_configured` = operational limitation; `provider_not_supported` = capability
  limitation; missing mapping = identity limitation. None is a "failure".
- A metric is NOT a promise of future accuracy.

## Go/No-Go
- Local backend `go` when the pipeline ran without fatal failure on fixtures with data;
  `go_with_warnings` when data was thin; `insufficient_data` when nothing was analyzed.
- Commercial readiness is conservative: NOT `beta_candidate` without provider configured +
  Firebase configured + a real long validation history.

## Env
`ENABLE_LOCAL_LONG_RUN_VALIDATION=true`, `ENABLE_LOCAL_VALIDATION_SCHEDULER=false`,
`LOCAL_VALIDATION_MODE=shadow_only`, `LOCAL_VALIDATION_MAX_FIXTURES=10`,
`LOCAL_VALIDATION_MAX_DURATION_MINUTES=720`, `LOCAL_VALIDATION_ENABLE_CAUSAL=true`,
`LOCAL_VALIDATION_ENABLE_LIVE_RECHECK=true`, `LOCAL_VALIDATION_ENABLE_COST_METRICS=true`.

## Persistence
Firebase: `localValidationRuns`, `localValidationFixtureSummaries`,
`localValidationReliabilityMetrics`, `localValidationCoverageMetrics`,
`localValidationCostMetrics`, `localValidationGoNoGoReports`, `backendHealthReports`.
Noop under Prisma → empty reads → `insufficient_data` (honest).
