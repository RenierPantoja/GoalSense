# Validation Campaign Tracker (B50)

`validation/validationCampaign.service.ts`. Groups several daily reports across a 7–14 day
campaign and aggregates metrics.

## Model (`ValidationCampaign`)
id, title, startedAt/endedAt, status (running/completed/cancelled), targetDays, actualDays,
dailyReportIds, aggregateMetrics (fixturesAnalyzed/withData, governanceEvaluations,
causalEvaluable/NotEvaluable, providerLimitedFixtures), blockers, warnings,
finalRecommendation, limitations.

## Functions
`createValidationCampaign`, `attachDailyReport` (idempotent per date; updates aggregates),
`buildCampaignSummary` (warns when `< 7` days or `< 25` causal evaluable), `closeCampaign`,
`listCampaigns`, `getCampaign`.

## API
`GET/POST /api/match-intelligence/local-validation/campaigns`,
`GET .../campaigns/:id`, `POST .../campaigns/:id/close`. Firebase `validationCampaigns`; Noop empty.

A campaign summary is observational — never a promise of accuracy; the recommendation never
claims commercial readiness.
