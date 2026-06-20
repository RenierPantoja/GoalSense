# Domain Unlock Status (B43) — Provider Bridge V2

`getDomainUnlockStatus(fixtureId, domain, provider)` (in `identity/providerBridge.service.ts`)
explains exactly whether a per-fixture domain can be fetched, and why not.

## States (`DomainUnlockState`)

`unlocked` | `blocked_missing_mapping` | `blocked_ambiguous_mapping` |
`blocked_provider_not_configured` | `blocked_provider_not_supported` |
`blocked_endpoint_not_implemented` | `blocked_operator_review`.

## Requirements per domain

| Domain | Required mappings | Endpoint implemented? |
|---|---|---|
| fixture_details / confirmed_lineups / post_match_stats | fixture | yes |
| standings | league + season | yes (`/standings?league=&season=`) |
| injuries | home_team + away_team (+ season) | yes (`/injuries?team=&season=`) |
| suspensions / head_to_head / squads / team_form / probable_lineups / competition_context | — | **no** → `blocked_endpoint_not_implemented` |

## Resolution helpers

`getProviderTeamId(name)`, `getProviderLeagueId(competition)`,
`getProviderHomeAwayTeamIdsForFixture(fixtureId)`,
`getProviderCompetitionContextForFixture(fixtureId)`,
`canFetchDomainForFixtureV2(fixtureId, domain)` (returns the resolved external ids when
allowed). Only CONFIRMED entity mappings resolve to ids.

## Router integration

`footballDataProviderRouter.bridgeGate` calls `canFetchDomainForFixtureV2` for keyed
providers on bridge domains: if allowed it injects `resolvedExternalFixtureId` /
`resolvedLeagueId` / `resolvedSeason` / `resolvedHomeTeamId` / `resolvedAwayTeamId` into
the adapter params; otherwise it returns a blocked result and the adapter is not called.

## Honesty rules

Candidate/ambiguous never unlock a critical fetch. Provider without env returns
`blocked_provider_not_configured` (no call). Undocumented endpoints return
`blocked_endpoint_not_implemented` (no guessing). Blocked is never a failure.

## B44 — Matrix V2

`getDomainUnlockStatusV2` / `getAllDomainUnlockStatuses` extend this with the endpoint
catalog (`endpointStatus`/`endpointKey`), resolved/missing ids, manual fallback and a
`recommendedNextAction`. See `DOMAIN_UNLOCK_MATRIX_V2.md`.
