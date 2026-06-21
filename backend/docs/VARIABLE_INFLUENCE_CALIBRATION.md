# Variable Influence Calibration (B48 / Bloco 5)

Part of the calibration loop (`causal/calibrationSuggestion.service.ts` →
`suggestVariableInfluenceRefinements`). Aggregates causal cases where influence was
over/underestimated or weak samples were overweighted, into
`VariableInfluenceCalibrationSuggestion`s.

## Issue types
overestimated, underestimated, wrong_direction, should_block, should_wait,
should_require_live_confirmation, weak_sample.

## Output
Each suggestion has `variableKey`, `patternFamily`, `suggestedMagnitudeChange`,
`evidenceCount`, `sampleQuality`, `confidenceOfSuggestion`, `autoApplyAllowed=false`,
`reviewStatus='pending'`. It NEVER changes the B46 rule-engine weights at runtime — the
influence engine remains deterministic and unchanged; this only proposes a future edit for
human review.
