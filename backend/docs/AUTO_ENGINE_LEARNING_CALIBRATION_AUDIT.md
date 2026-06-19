# Auto Engine Learning & Calibration — Audit (Phase B24)

Read-only audit before building the Auto Engine's own (separate) learning/calibration layer.
Locks exactly which real data the closed B22/B23 loop produces, so aggregation is honest and
never auto-tunes the engine.

## Where the data lives (from B22/B23)
- **`ManualPromotedAlertLink`** (`autoPromotedAlertLinks`, `mpa_${opportunityId}`): one per
  promoted opportunity (pending or resolved). Carries `opportunityId`, `alertId`, `ledgerId`,
  `opportunityType`, `originalScore`, `originalConfidenceBand`, `provenance`, `promotedAt`.
  → drives **`promotedAlertsTotal`** and the set of promoted opportunities.
- **`AutoOpportunityOutcomeSummary`** (`autoOpportunityOutcomeSummaries`, `oos_${opportunityId}`):
  created at resolution. Carries `result` (`confirmed|confirmed_partial|failed|unknown|expired`),
  `outcomeReason`, `confirmedAt/failedAt/unknownReason`, `timeToResolutionMinutes`,
  `learningEventIds`. → the **resolved sample** for rates.
- **`PromotedAlertOutcomeLink`** (`autoPromotedAlertOutcomeLinks`, `pol_${alertId}`): `result`,
  `resolutionType`, `dataQualityAtResolution`. Redundant with the summary for B24 (we key on the
  summary), but available.
- **`AutoOpportunity`** (`autoOpportunities`): `opportunityType`, `status`, `score`,
  `confidenceBand`, `scoreBreakdown.finalScore`, `evidence.dataQuality`, `leagueName`,
  `homeTeam`, `awayTeam`, `minute`, `riskGate.blockReasons`/`warnings`, `relatedPatternIds`,
  `contextFit`. → the calibration dimensions (type / score bucket / band / league / team /
  minute window / data quality).
- **`LearningEvent` `source:'promoted_alert_resolution'`**: already persisted per resolution
  (B23). B24 adds NEW observational events with `source:'auto_engine_calibration'`.

## Join model
Key = `opportunityId`. For each **outcome summary** (= resolved promoted opp), join the
`AutoOpportunity` (one `listAutoOpportunities({limit})` → map by id, no N+1). `promotedAlertsTotal`
comes from `listManualPromotedAlertLinks`. Blocked-reason analysis loads the same opportunities
list and counts `riskGate.blockReasons` among `status==='blocked'`.

## Honest rules (carried from B13/B23)
- Rates over **resolved** only; `usefulCount = confirmed + confirmed_partial`; `failedRate`
  numerator = `failed` only; `unknownRate = (unknown + expired)/resolved`. (reuse
  `learningStats.util.ts`.)
- `sampleQualityOf(resolved)`: <5 insufficient, <15 low, <40 moderate, else strong. Recommendation
  strength is gated by sample quality — small samples never produce "strong"/certain language.
- `unknown` is never `failed`. `confirmed_partial` is partial-useful. Score is signal-quality,
  never probability.

## Risk-gate honesty (important limitation)
Blocked opportunities are **never promoted** (B22 guard requires `riskGate.allowed`), so they
have **no outcome**. Therefore the risk-gate profile cannot prove a blocker "would have failed".
B24 reports blocked-reason **frequency** and interprets data-integrity blockers
(`data_poor`, `missing_required_data`, `too_much_unknown`, `provider_stale`) as `useful_blocker`
(trust them; keep blocking), others as `insufficient_sample`. This is explicitly documented as a
limitation, not a hit-rate.

## What B24 adds (separate from manual-pattern learning)
- New module `autoEngine/autoEngineLearning.types.ts` (contracts) +
  `utils/autoEngineCalibration.util.ts` (PURE builder/calibration) +
  `autoEngineLearningAggregator.service.ts` (loads/joins/persists) +
  `autoEngineCalibration.service.ts` (read overview + flags) +
  `autoEngineLearningScheduler.service.ts` (disabled by default).
- New collections `autoEngineLearningRuns`, `autoEngineLearningProfiles`,
  `autoEngineLearningRecommendations` (+ repo methods). **Does NOT touch** `patternLearningProfiles`
  or any B13 collection — Auto Engine learning is a separate namespace.
- Flags (all OFF/manual): `ENABLE_AUTO_ENGINE_LEARNING_REBUILD`,
  `ENABLE_AUTO_ENGINE_LEARNING_SCHEDULER`, `AUTO_ENGINE_LEARNING_INTERVAL_MS`.
- Routes under `/api/intelligence/auto-engine/learning/*` + `/calibration/overview`.
- Frontend: a "Calibração" segment in the cockpit + calibration context in the opportunity
  drawer + maturity metrics in the overview.

## Invariants verified against code
No path here creates an alert, sends Telegram, uses odds, mutates an opportunity/alert/pattern,
recomputes a score, or touches `performance` counters. Everything is recomputed from raw records
(idempotent) and persisted only with `--persist` / `write:true`. Firebase persists; Noop returns
empty / accepts writes without throwing.

## Out of scope (deferred)
Feeding calibration back into runtime scoring/risk-gate; multi-user; auth on routes; time-windowed
trend charts; cross-source blending with B13 pattern profiles.
