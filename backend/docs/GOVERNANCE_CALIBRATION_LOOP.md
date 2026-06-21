# Governance Calibration Loop (B48 / Bloco 5)

`causal/calibrationSuggestion.service.ts` (PURE aggregation) + `governanceCalibrationReview.service.ts`
(controlled human review). The loop turns repeated causal findings into conservative
refinement suggestions for governance — but **never auto-applies**.

## Suggestion generation (min-sample gated)
- `suggestGovernancePolicyRefinements` — too_strict (overconservative) / too_loose
  (ignored block/wait) clusters.
- `suggestMemoryRefinements`, `suggestDataAcquisitionRefinements`, `suggestLiveRecheckRefinements`.
- `suggestVariableInfluenceRefinements` — overestimated / weak-sample variables.
- Confidence: `< 3` cases → none; `≥3` → low; `≥CAUSAL_MIN_CASES_FOR_MEDIUM_SUGGESTION` →
  medium; `≥CAUSAL_MIN_CASES_FOR_HIGH_SUGGESTION` → high. All carry `autoApplyAllowed=false`,
  `reviewStatus='pending'`.

## Human review
`buildGovernanceCalibrationReport`, `markSuggestionReviewed`, `rejectSuggestion`,
`acceptSuggestionForFutureImplementation`. **Accept marks for FUTURE implementation only** —
it does not apply any runtime change, never touches score/confidence/patterns/enforce.
Every review is audited by the caller.

## Inviolable
Calibration suggested ≠ calibration applied. The engine never self-modifies; the actual
policy/influence weights remain exactly as coded until a human implements a change in a
future block.
