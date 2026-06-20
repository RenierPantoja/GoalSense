# Acquisition Runner V4 (B44)

Critical-domain orchestration in `preMatchAcquisitionRunner.service.ts`.

## Functions

- `runDomainAcquisition(fixtureId, domain)` — consults the Matrix V2; fetches via the
  router ONLY when `recommendedNextAction === 'ready_to_fetch'`; otherwise records the
  blocker WITHOUT calling the provider. Persists a Snapshot Store V2 record.
- `runCriticalDomainAcquisitionForFixture(fixtureId)` — runs the ordered critical set:
  fixture_details, standings, squads, injuries, suspensions, confirmed/probable lineups,
  head_to_head, team_form, post_match_stats.
- `runCriticalDomainAcquisitionForToday()` — for each MatchDayScope fixture.
- `buildCriticalDomainAcquisitionReport(fixtureId)` — read-only matrix snapshot (no fetch).

## Report — `CriticalDomainAcquisitionReport`

`domainsFetched`, `domainsBlocked`, `domainsManualRecommended`,
`domainsProviderNotConfigured`, `domainsEndpointMissingDocs`, `domainsWithConfirmedEmpty`,
`criticalDomainsReady`, `criticalDomainsMissing`, `nextRefreshRecommendations`.

## Honesty

No provider call when blocked. Blocked is never a failure. Empty only as
`available_empty_confirmed`. Respects the provider budget guard (via the router). Errors
are non-fatal.
