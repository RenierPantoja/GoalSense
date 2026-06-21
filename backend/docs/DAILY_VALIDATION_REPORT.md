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
