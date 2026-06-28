# Daily Validation Report (B50)

`validation/dailyValidationReport.service.ts`. Consolidates a day's local validation into
one report: plan/coverage/reliability/cost + backend health + go/no-go.

## Contents (`DailyValidationReport`)
fixturesPlanned/Analyzed/Skipped; providerConfigured + providerCoverage + domainCoverage;
manualIntakeUsed; mappingsConfirmed/Missing; influenceSummary; governanceSummary
(evaluations/wouldAllow/Monitor/Wait/Block/aligned/tooStrict/tooLoose); holdsSummary;
causalSummary (created/evaluable/notEvaluable); notEvaluableSummary; providerLimitations;
dataLimitations; costMetrics; backendHealth; goNoGo; recommendedActions; limitations.

## Honesty
- `unknown`/`not_evaluable` are surfaced separately and never counted as failures.
- Provider/data limitations are listed separately from failure.
- A metric is NOT a promise of accuracy.

## API
`GET /api/match-intelligence/local-validation/daily-report?date=YYYY-MM-DD`,
`POST /api/match-intelligence/local-validation/daily-report/generate` (operator; optional
`campaignId` to attach). Persisted to Firebase `dailyValidationReports` keyed by date; Noop
returns empty.
# B59 Long-Session Metrics

Daily reports now include ESPN Live-First worker metrics: worker runs, completed worker sessions, orphan sessions detected/recovered, post-match sweeper activity, completed live-first fixtures, pending post-match count, evaluable live-first cases, not_evaluable reasons, average session duration, and average snapshots per completed fixture.

# B61 Deploy Context

Daily reports now also include control-plane environment, worker runtime environment, deployed commit, deploy health, read-only control-plane status, whether worker commands are blocked in Vercel, and whether latest worker/causal data is visible from the control plane.

# B62 Control Plane Drill Context

Daily reports now include control-plane drill fields: URL, runtime, read-only status, command blocking, local worker visibility from Vercel, heartbeat visibility, daily-report visibility, causal-case visibility, freshness status, lag, and limitations.
