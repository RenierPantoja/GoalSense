# Post-Match Causal Learning (B48 / Bloco 5)

The causal layer connects decisions (governance/influence/memory/data) to outcomes to
understand WHY a decision worked, failed, should have waited or stayed out — producing
conservative, human-review-only refinement suggestions. **Never** changes runtime/score/
confidence/patterns/alert results/enforce.

## Pipeline & files (`modules/footballIntelligence/causal/`)
- `causalLearning.types.ts` — contracts.
- `decisionOutcomeLinker.service.ts` — honest decision↔outcome link (exact → unknown).
- `causalLearningCaseBuilder.service.ts` — assembles cases from gov result + outcome + post-match.
- `causalOutcomeClassifier.service.ts` — PURE, conservative classification.
- `causalInsightGenerator.service.ts` — PURE, evidence-backed insights.
- `calibrationSuggestion.service.ts` — PURE, min-sample-gated suggestions.
- `governanceCalibrationReview.service.ts` — human review (accept = future only).
- `causalLearningRunner.service.ts` — manual-first orchestration + LearningEvents.

## Classification (not a probability)
good/bad decision × good/bad outcome, right_to_wait, should_have_waited, right_to_stay_out,
should_have_stayed_out, too_early/too_late, overconservative, too_loose, provider_limited,
data_insufficient, variance_or_shock, not_evaluable, unknown.

## Honest principles
- An error is NOT "chance" without evidence; success is not genius by default.
- variance/shock only with a recorded extreme event (red card / late goal / shock).
- provider/data gaps separated from bad analysis; weak sample/memory separated from pattern.
- a weak link never becomes strong causality; `unknown`/`not_evaluable` are never `failed`;
  `confirmed_partial` is partial-useful.
- suggestions are `autoApplicable=false` / `autoApplyAllowed=false`, `requiresHumanReview=true`.

## Env
`ENABLE_CAUSAL_LEARNING=true`, `ENABLE_CAUSAL_LEARNING_BUILD=true`,
`ENABLE_CAUSAL_LEARNING_SCHEDULER=false`, `ENABLE_CAUSAL_CALIBRATION_SUGGESTIONS=true`,
`CAUSAL_LEARNING_MAX_FIXTURES_PER_RUN=20`, `CAUSAL_LEARNING_MAX_CASES_PER_RUN=200`,
`CAUSAL_MIN_CASES_FOR_MEDIUM_SUGGESTION=10`, `CAUSAL_MIN_CASES_FOR_HIGH_SUGGESTION=25`.

## Persistence
Firebase: `causalLearningCases`, `decisionOutcomeLinks`, `causalLearningInsights`,
`governanceCalibrationSuggestions`, `variableInfluenceCalibrationSuggestions`,
`causalLearningRuns`. Noop under Prisma (empty reads). Surfaced via PostMatch V7 + Backstage.
