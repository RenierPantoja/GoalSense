# Domain Unlock Matrix V2 (B44)

`providerBridge.getDomainUnlockStatusV2(fixtureId, domain)` and
`getAllDomainUnlockStatuses(fixtureId)` combine the B43 unlock status with the endpoint
catalog and resolved/missing ids.

## Added fields (on `DomainUnlockStatus`)

`endpointStatus`, `endpointKey`, `endpointImplemented`, `endpointDocumented`,
`idsResolved` (fixtureId/homeTeamId/awayTeamId/leagueId/season), `idsMissing`,
`manualFallbackAvailable`, `recommendedNextAction`.

## recommendedNextAction

`ready_to_fetch` | `configure_provider` | `run_fixture_mapping` | `run_entity_mapping` |
`confirm_mapping` | `use_manual_intake` | `provide_endpoint_docs` | `stay_out`.

Computed from: unlock state (mappings), endpoint catalog (documented/env), resolved ids,
and manual fallback availability. `explainDomainUnlockMatrix(fixtureId)` returns a
one-line summary across all matrix domains.

## Honesty

Only confirmed mappings resolve to ids. Undocumented endpoints surface
`provide_endpoint_docs` (or `use_manual_intake` when manual exists). The Acquisition
Runner V4 only fetches `ready_to_fetch` domains.
