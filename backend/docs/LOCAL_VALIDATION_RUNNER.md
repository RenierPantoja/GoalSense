# Local Validation Runner (B49 / Bloco 6)

`validation/localValidationRunner.service.ts`. Manual-first orchestration over today's (or
a single) fixture(s). Non-fatal per fixture — one failure never kills the run.

## Per-fixture pipeline
package V5 (cached) → memory (from package) → influence (cached) → governance evaluation
(shadow, source `governance_replay`) → causal learning (if finished + enabled) → fixture
summary (persisted). `dry_run` mode measures only (no governance/causal).

## Entry points
`runValidationForToday()`, `runValidationForFixture(fixtureId)`, `startValidationRun(plan)`,
`cancelValidationRun(runId)`, `getValidationRun`, `listValidationRuns`. After a run, metrics
are collected (`collectRunMetrics`) and the per-run cache is cleared.

## Guarantees
Scheduler OFF; observe/shadow; never blocks an alert; never enforces; never sends
Telegram/odds; never changes alert results. Respects `LOCAL_VALIDATION_MAX_FIXTURES` and
`LOCAL_VALIDATION_MAX_DURATION_MINUTES`. Under Noop returns a cancelled/empty run honestly.

## B50 — feeds the daily report + campaign

After validation runs (B49), B50's `dailyValidationReport.service` consolidates the latest
run's metrics + backend health + provider coverage into a per-day report, which can be
attached to a `ValidationCampaign`. The runner itself is unchanged (still manual-first,
observe/shadow, non-fatal). See `DAILY_VALIDATION_REPORT.md`.
