# Provider Bridge (B42)

`identity/providerBridge.service.ts` answers: for an ESPN/canonical fixture, which
external provider ids are available, and may a domain be fetched?

## API

- `getProviderFixtureId(fixtureId, provider)` → `{ providerFixtureId, mappingStatus,
  mappingConfidence, mappingBand }`. `providerFixtureId` is non-null ONLY for a confirmed
  mapping (manual or auto).
- `canFetchDomainForFixture(fixtureId, domain, provider)` →
  `allow_confirmed` (confirmed mapping → fetch allowed, returns the external id) |
  `blocked_missing_provider_mapping` | `blocked_ambiguous_provider_mapping` |
  `preview_unsafe_candidate` (candidate only — never unlocks a critical fetch) |
  `not_a_fixture_domain`.
- `explainBlockedDomain(...)`.

Critical fixture domains: confirmed/probable lineups, injuries, suspensions,
fixture_details, post_match_stats, head_to_head.

## Router integration

`footballDataProviderRouter` calls `bridgeGate(provider, requiresApiKey, domain, params)`
before invoking a keyed provider's adapter for a fixture-scoped domain:
- confirmed → injects `resolvedExternalFixtureId` into params; adapter performs the
  documented per-fixture call.
- otherwise → returns a `blocked_missing_provider_mapping` /
  `blocked_ambiguous_provider_mapping` result; the adapter is not called.

ESPN and manual providers are never bridged.

## Honesty rules

The bridge never guesses an id. Only a confirmed mapping unlocks a critical fetch;
candidates are preview-only. This is what finally removes the name-guess dependency from
the router.

## B43 — Provider Bridge V2

Adds `getProviderTeamId`, `getProviderLeagueId`, `getProviderSeason`,
`getProviderHomeAwayTeamIdsForFixture`, `getProviderCompetitionContextForFixture`,
`canFetchDomainForFixtureV2` and `getDomainUnlockStatus`. Unlocks standings (league +
season) and injuries (team ids) when CONFIRMED entity mappings exist; everything else
stays `blocked_endpoint_not_implemented`/`blocked_missing_mapping`. See
`DOMAIN_UNLOCK_STATUS.md`.
