# Squad / Injury / Suspension / Lineup Engine

`squadAvailabilityEngine.service.ts` answers "who plays, who doesn't, and how much it
changes the read". The backend does **not** collect lineups, squads, injuries or
suspensions, so this engine is deliberately HONEST rather than fabricated.

## Output — `SquadAvailabilityProfile`

- `lineupStatus`: `unavailable` | `probable` | `confirmed` | `partial` |
  `not_available_yet`. We never have real lineups, so the value reflects the **temporal
  window** only:
  - more than ~60 min before kickoff → `not_available_yet` + `waitForLineupRecommended`;
  - within the window or live/finished → `unavailable` (still not collected).
- `injuryImpact`, `suspensionImpact`, `rotationRisk`, `benchStrength`,
  `replacementQuality`, `tacticalImpact`: all `unknown`.
- `keyAbsences` / `keyReturns`: **empty arrays mean "not collected", NOT "nobody out".**
- `analysisImpact`: `uncertain`.

## Inviolable semantics

- Unknown injury ≠ no injury. Unknown suspension ≠ no suspension.
- Missing lineup ≠ empty lineup.
- A pending lineup near kickoff is a **blocking** decision input → `wait_for_lineup`,
  surfaced by the precheck. A confirmed lineup (when ever collected) would invalidate a
  prior read and require recomputation.

## Temporal readiness

`LINEUP_RELEASE_MINUTES_BEFORE = 60` models the typical pre-match lineup window so the
engine can recommend waiting instead of alerting on a thin pre-match base.

## Limitations

Everything here is structural honesty about absent data. When/if lineup/injury/
suspension collection is added (e.g. via a dedicated provider), this engine becomes the
integration point — the contracts already exist in `footballIntelligence.types.ts`.
