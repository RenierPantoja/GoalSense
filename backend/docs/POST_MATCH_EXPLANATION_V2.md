# Post-Match Explanation V2 (B40)

`buildPostMatchExplanationV2(fixtureId)` (in `postMatchExplanationEngine.service.ts`)
extends the V1 explanation with lineup/provider/context awareness and a single
`causeCategory`.

## Added fields

`causeCategory`: `game_state_shock` | `data_limitation` | `decision_flaw` |
`variance_shock` | `confirmed_read` | `inconclusive`.

Plus: `lineupConfirmedRead`/`lineupInvalidatedRead`/`keyAbsenceWeighed`/
`suspensionOrInjuryAffected` (all `unknown` until structured lineup data exists),
`redCardChangedGame`, `substitutionChangedTempo`, `competitionContextChangedBehavior`,
`classicOrKnockoutVolatility`, `providerWasLimited`, `shouldHaveWaitedLineup`,
`shouldHaveWaitedLiveConfirmation`.

## Honesty rules

- A miss is only `variance_shock`/`game_state_shock` with evidence of an extreme event
  (red card, etc.); otherwise it is `decision_flaw` (fundamentals contradicted),
  `data_limitation` (missing critical data), or `inconclusive` (investigate, not chance).
- `unknown`/`expired`/`pending` are never failures.
- Lineup-related causes stay `unknown` because the backend does not collect structured
  lineups; we never fabricate a "key absence weighed".

The V1 explanation remains for the B39 surface; V2 is additive.
