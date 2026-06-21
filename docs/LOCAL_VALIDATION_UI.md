# Local Validation UI (B49 / Bloco 6)

Backstage console for the final local validation + backend health.

## Files
- `src/features/matchIntelligence/localValidationTypes.ts` — DTOs + labels.
- `src/services/localValidationApi.ts` — read-only GETs + operator POST run/cancel/repair.
- `src/features/command/components/views/backstage/LocalValidationPanel.tsx` — panel
  (rendered near the top of `BackstageMatchIntelligencePanel.tsx`, global / not fixture-scoped).

## Sections
- **Saúde + go/no-go**: backend health, local backend status, commercial readiness, Firebase/
  provider off badges.
- **Plano de hoje**: selected/skipped, estimated cost (reads/writes/provider calls), risks.
- **Confiabilidade**: fixtures analyzed, with data, provider-limited, governance evaluations,
  would_wait/would_block, causal evaluable vs not_evaluable, holds.
- **Cobertura de dados**: domains covered / blocked by env / blocked by docs.
- **Antes de comercializar**: warnings, required fixes, recommended next steps.

## Honest framing
A validation metric is NOT a promise of accuracy; go/no-go is technical, not a commercial
guarantee. `unknown`/`not_evaluable` and provider limitations are shown separately from real
failure. No betting language; no enforce; no Telegram. Env-gated by
`ENABLE_LOCAL_LONG_RUN_VALIDATION`; POST run/cancel/repair require operator.

## Endpoints used
`/api/match-intelligence/local-validation/plan/today`, `run/today`, `run/fixtures/:id`,
`runs` (+`/:id`, `/cancel`), `runs/:id/metrics/{reliability,coverage,cost}`,
`runs/:id/report/{readiness,go-no-go}`, `provider-coverage`, `backend-health`,
`links/repair/{today,fixtures/:id}`.

## B50 — daily report, campaign and beta readiness panels

The Backstage global header now also renders `DailyValidationReportPanel`,
`ValidationCampaignPanel` and `ControlledBetaReadinessCard` (B50) alongside the Local
Validation panel. They surface the per-day report, the multi-day campaign aggregate and the
conservative controlled-beta readiness — all observational, never a probability, never a
commercial guarantee. See `docs/DAILY_VALIDATION_REPORT_UI.md`, `docs/VALIDATION_CAMPAIGN_UI.md`.
