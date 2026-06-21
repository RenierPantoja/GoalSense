# Daily Validation Report UI (B50)

## Files
- `src/features/matchIntelligence/dailyValidationReportTypes.ts` — DTO.
- `src/services/localValidationApi.ts` — `getDailyValidationReport`, `generateDailyValidationReport`.
- `src/features/command/components/views/backstage/DailyValidationReportPanel.tsx` — panel
  (rendered in the Backstage global header row, next to the campaign panel).

## What it shows
Date + backend health + go/no-go; fixtures planned/analyzed/skipped; governance summary
(would_wait/would_block); causal evaluable vs not_evaluable; manual intake; provider
limitations (labeled ≠ failure); recommended actions. Operator can "Gerar hoje".

## Honest framing
Observational; a metric is not a probability of accuracy; provider limitation and
not_evaluable are shown separately from failure. Env-gated; generate requires operator.
