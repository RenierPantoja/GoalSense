# Matchup Fundamental Memory (B45 / Bloco 2)

Deep memory for a specific confrontation, built on B39 `buildHeadToHead` (internal
signal ledger only — there is NO external head-to-head provider).

## Files
- `memory/matchupFundamentalMemory.service.ts` — `buildMatchupMemory(home, away)`,
  `buildMatchupMemoryForFixture(fixtureId)`, `explainMatchupMemory`.

## Output (`MatchupFundamentalMemoryProfile`)
- `matchesFound` / `relevantMatches` / `outdatedMatches`.
- `sample`: H2H-tuned `SampleQualityAssessment` (`evaluateH2HSampleQuality`, thresholds
  strong=6 / usable=3).
- `matchupState`: `insufficient_data` → `developing` → `usable` → `mature`.
- `maturity`: low / medium / high / insufficient_data.

## Inviolable rules
- Insufficient confrontations are `insufficient_data` and **NEVER a tabu**.
- Old confrontations are `outdated` and down-weighted.
- `maturity`/reliability is data-confidence, not a probability of winning.

## Persistence
Firebase collection `matchupFundamentalMemoryProfiles`; Noop under Prisma (reads empty).
