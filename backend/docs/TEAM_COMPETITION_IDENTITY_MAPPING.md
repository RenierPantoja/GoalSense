# Team / Competition Identity Mapping (B43)

Extends B42 fixture identity to teams/competitions/seasons so domains needing
teamId/leagueId/season can be unlocked. Never by name alone; ambiguity needs the
operator.

## Derivation (`identity/providerEntityMappingDerivation.service.ts`)

`deriveEntityMappings('api_football')` reads CONFIRMED fixture mappings (B42), and for
each, reads the matched API-Football fixture from the documented `today_fixtures` list
(which carries `teams.home.id`, `teams.away.id`, `league.id`, `league.season`,
`league.country`). It pairs ESPN home/away names → API team ids and ESPN competition →
API league id, then runs the pure classifiers:

- `deriveTeamMappingsFromPairs` / `deriveCompetitionMappingsFromPairs` (PURE, tested):
  same ESPN entity → same external id across ≥ N confirmed fixtures ⇒ `auto_confirmed`;
  below threshold ⇒ `candidate`; multiple external ids ⇒ `ambiguous` (no external id
  exposed). Never name-only. `strength: 'fixture_derived'`.

Operator decisions are respected: an existing `rejected`/`manually_confirmed` mapping is
not overwritten by derivation.

## Review (`identity/providerEntityMappingReview.service.ts`)

`confirmTeamMapping` / `rejectTeamMapping` / `confirmCompetitionMapping` /
`rejectCompetitionMapping` (audited), `listMappingsNeedingReview`. Confirm unlocks
domains; reject is not auto-reused.

## Persistence

`providerTeamMappings`, `providerCompetitionMappings`, `providerSeasonMappings`,
`entityMappingDerivationRuns` (Firebase). Noop-safe.

## Env

| flag | default |
|---|---|
| `ENABLE_ENTITY_MAPPING_DERIVATION` | `true` |
| `ENTITY_MAPPING_AUTO_CONFIRM` | `true` |
| `TEAM_MAPPING_MIN_CONFIRMED_FIXTURES` | `2` |
| `COMPETITION_MAPPING_MIN_CONFIRMED_FIXTURES` | `2` |
| `ENTITY_MAPPING_HIGH_CONFIDENCE_THRESHOLD` | `0.90` |

## Honesty rules

Derived from real fixture co-occurrence, never names. Homonyms surface as ambiguous.
Provider without env is never called (derivation returns `provider_not_configured`).
