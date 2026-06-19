# Auto Engine Calibration — UI (Phase B24)

Lets the user see whether the Auto Engine is getting calibrated (or just noisy) from the outcomes
of the alerts they manually promoted. Observational only: no certainty language, no probability,
no auto-application, no betting framing. `unknown` is neutral; small samples are flagged.

## Types & API (`autoEngineTypes.ts`, `autoEngineApi.ts`)
- DTOs: `AutoEngineLearningProfileDto`, `AutoOpportunityTypeProfileDto`,
  `AutoScoreCalibrationProfileDto`, `AutoRiskGateProfileDto`, `AutoDataQualityProfileDto`,
  `AutoEngineLearningRecommendationDto`, `AutoEngineLearningRunDto`,
  `AutoEngineCalibrationOverviewDto`; `AUTO_SAMPLE_QUALITY_LABEL`.
- API: `getAutoEngineLearningProfile`, `getAutoEngineLearningRuns`,
  `getAutoOpportunityTypeProfile(type)`, `getAutoEngineLearningRecommendations`,
  `getAutoEngineCalibrationOverview`, `rebuildAutoEngineLearning` (handles 403/disabled).

## Cockpit — new "Calibração" segment
`AutoEngineCockpit` gains a fourth segment (Visão geral · Oportunidades · Bloqueadas · Calibração)
rendering `AutoEngineCalibrationPanel`. The panel shows:
- maturity headline (resolved sample, promoted total, useful%, unknown%, sample quality);
- opportunity-type rows (useful%/unknown% + sample quality + frequent unknown reasons);
- score calibration bars per bucket (labeled "qualidade de sinal, não probabilidade");
- data-quality and risk-gate breakdowns (blockers tagged "bloqueio útil" / "sem outcome");
- observational recommendations tagged by strength (low/medium/high);
- limitations.
A "Recalcular" button calls `rebuildAutoEngineLearning` (shows an honest disabled message when
`ENABLE_AUTO_ENGINE_LEARNING_REBUILD` is off). Empty state: "Ainda não há outcomes suficientes de
alertas promovidos."

## Opportunity drawer — calibration context
`AutoOpportunityDrawer` ("Contexto histórico" tab) fetches
`getAutoOpportunityTypeProfile(opportunityType)` and shows the type's resolved sample + sample
quality, useful%/unknown%, and this opportunity's score bucket, with a cautious note. Honest empty
state when there is no profile. The opportunity score is never changed.

## Cockpit overview — engine maturity
`AutoEngineOverviewPanel` fetches the calibration overview (via the cockpit) and, when data
exists, renders a "Maturidade do motor (calibração)" card: resolved sample, useful%, unknown%,
sample quality, top calibrated opportunity type, highest-unknown type, last calibration time.
Labeled "não é taxa de acerto, não autoajusta o motor".

## Honest states
- Backend offline / not configured → cockpit empty note; calibration panel shows loading→empty.
- No promoted outcomes yet → empty calibration with guidance.
- Rebuild disabled → button shows the disabled message; GETs still work.
- Insufficient sample → explicit banner; recommendations stay low-strength.

## Verification
- `npm run check:encoding` ✓ · `npx tsc --noEmit` ✓ · `npx vite build` ✓
