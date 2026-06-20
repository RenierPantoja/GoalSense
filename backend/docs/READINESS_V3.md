# Readiness V3 (B41)

`buildFundamentalReadinessV3(fixtureId)` (in `fundamentalReadinessEngine.service.ts`)
considers provider + manual coverage and conflicts.

## Output — `FundamentalReadinessV3`

`status`: `ready_with_provider_data` | `ready_with_manual_data` | `partially_ready` |
`wait_for_lineup` | `wait_for_manual_review` | `provider_limited` | `stay_out`.

Plus `score` (readiness only, NOT a probability), `providerDataCoverage`,
`manualDataCoverage`, `conflictPenalty`, `lineupSourceReliability`,
`injurySourceReliability`, `suspensionSourceReliability`, `criticalDomainBlockers`,
`manualReviewRequired`, `waitReasons`, `stayOutReasons`, `limitations`.

## Logic

- Conflict (provider × manual) → `wait_for_manual_review`.
- Lineup not confirmed within window → `wait_for_lineup`.
- Provider coverage ≥ 50% → `ready_with_provider_data`; else manual ≥ 50% →
  `ready_with_manual_data`; some coverage → `partially_ready`; none → `provider_limited`.
- Score = base + provider/manual coverage − conflict penalty (capped when waiting).

## Honesty rules

Reliable manual data can enable analysis (with a `manual` badge in the UI). Weak manual
data only raises caution. Conflict reduces readiness. Missing injuries/suspensions
providers → `provider_limited`, never "no injuries". Readiness V1/V2 remain for older
surfaces; V3 is additive.
