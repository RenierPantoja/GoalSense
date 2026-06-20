# Contextual Pattern Memory (B45 / Bloco 2)

Remembers how each PATTERN behaved under each CONTEXT (knockout, high-importance,
late-game, first-half, high-volatility) from internal observations.

## Files
- `memory/contextualPatternMemory.service.ts` — `buildPatternContextProfile`,
  `getPatternMemoryForFixture`, `getPatternMemoryForTeam`, `findStrongContexts`,
  `findStayOutContexts`, `findMisleadingContexts`, `explainPatternContext`.

## Output (`HistoricalPatternContextProfile`)
- counts: confirmed / confirmedPartial / failed / unknown / notEvaluable.
- `classification`: `confirmed_strong` | `confirmed_partial_useful` | `mixed` |
  `failed_context` | `not_evaluable` | `not_enough_data`.
- `recommendation`: `use_with_confidence` | `use_with_caution` | `monitor_only` |
  `stay_out` | `insufficient`.

## Distinctions preserved
- `confirmed_partial` = partial-useful (NOT failed).
- `unknown` / `not_evaluable` are NEVER failures — surfaced as `not_evaluable` /
  `not_enough_data`.
- `misleading_risk` samples become `use_with_caution`, never a strong signal.

Advisory only; never changes score/confidence/patterns/alerts.
