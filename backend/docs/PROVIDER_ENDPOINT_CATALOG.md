# Provider Endpoint Catalog (B44)

`providers/providerEndpointCatalog.service.ts` is the single source of truth for which
provider endpoints are really known, documented, implemented and safe to call.

## Entry

`provider`, `domain`, `endpointKey`, `implemented`, `documented`, `requiresApiKey`,
`requiredIds` (fixtureId/teamId/leagueId/season/...), `method`, `safetyStatus`,
`limitations`, `docsReference`.

## Safety status

`safe_to_call` | `blocked_missing_env` | `blocked_missing_mapping` |
`blocked_not_documented` | `not_supported` | `not_implemented` | `not_used`.

`safe_to_call` requires: documented + implemented + (key present if required). Missing
ids → `blocked_missing_mapping` (computed in `canCallEndpoint`).

## Catalogued endpoints

- ESPN: today_fixtures, fixture_details, live_events, live_stats, post_match_stats (no key).
- API-Football (documented in repo / official): today_fixtures (`/fixtures?date=`),
  fixture_details (`/fixtures?id=`), post_match_stats (`/fixtures/statistics?fixture=`),
  confirmed_lineups (`/fixtures/lineups?fixture=`), standings
  (`/standings?league=&season=`), injuries (`/injuries?team=&season=`).
- API-Football undocumented (never called): suspensions, head_to_head, squads,
  team_form, probable_lineups, competition_context → `blocked_not_documented`.

## API

`listProviderEndpointCatalog()`, `getEndpointForDomain(provider, domain)`,
`canCallEndpoint(provider, domain, ids)`, `explainEndpointBlock(...)`. Odds is never
catalogued as callable.
