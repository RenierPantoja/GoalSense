# Pre-Match Acquisition V3 (B43)

`buildAcquisitionReportV3(fixtureId)` + `runAcquisitionForFixtureV3` /
`runAcquisitionForTodayV3` (in `preMatchAcquisitionRunner.service.ts`) make acquisition
identity-driven.

## Report — `AcquisitionReportV3`

- `domainUnlockStatuses` — per-domain `DomainUnlockStatus` from the Provider Bridge V2.
- `domainsUnlocked` / `domainsStillBlocked`.
- `missingMappings` / `ambiguousMappings` — domains blocked by entity mapping.
- `manualIntakeRecommended` — domains blocked by undocumented endpoint / unsupported
  provider.

Covers: fixture_details, confirmed_lineups, post_match_stats, standings, injuries,
suspensions, head_to_head, squads.

## Behavior

Before fetching a per-fixture external domain, the router consults the bridge; locked
domains are not called (no wasted/failed fetch). Blocked is never a failure. Suggested
actions: `run_identity_resolution`, `run_entity_mapping_derivation`, `confirm_mapping`,
`configure_provider`, `use_manual_intake`.

## Honesty rules

No fetch when locked. Bridge resolves only CONFIRMED mappings to ids. Nothing invented.
V1/V2 reports remain; V3 is additive.

## B44 — Acquisition Runner V4 (critical orchestration)

V4 (`runCriticalDomainAcquisitionForFixture/Today`) orchestrates the critical domain set
governed by the Provider Endpoint Catalog + Domain Unlock Matrix V2, fetching only
`ready_to_fetch` domains. See `ACQUISITION_RUNNER_V4.md` + `CRITICAL_PRE_MATCH_DATA_ACQUISITION.md`.
