# Similar Scenario Retrieval (B45 / Bloco 2)

Finds past fixtures similar to the current one by shared context features. This is
RETRIEVAL, **never prediction**.

## Files
- `memory/similarScenarioRetrieval.service.ts` — `findSimilarPreMatchScenarios`,
  `findSimilarLiveScenarios`, `rankScenariosByUsefulness`, `explainScenarioSimilarity`.

## Output (`SimilarScenarioResult` / `SimilarMatchScenario`)
- `similarityScore` ∈ [0,1] — a retrieval distance over features (knockout,
  importance, minute bucket, volatility, competition). It is **NOT a probability** of
  the outcome repeating.
- `similarityQuality`: strong / usable / weak / insufficient.
- `observedOutcome`: confirmed / confirmed_partial / failed / unknown / not_evaluable /
  no_alert (surfaced honestly).
- old scenarios are tagged `[antigo]` and carry an `outdated` caveat.

## Inviolable rules
Few/old matches → low usefulness and explicit caveats; the result never asserts what
WILL happen. Advisory only.
