# Readiness V5 (B44)

`buildFundamentalReadinessV5(fixtureId)` measures readiness by REAL data coverage of the
critical domains (confirmed_lineups, injuries, standings), reading persisted snapshots +
the unlock matrix + manual records.

## Output

`status` (`ready_with_real_provider_data` | `ready_with_mixed_provider_manual_data` |
`partially_ready_provider_limited` | `wait_for_lineup` | `wait_for_domain_fetch` |
`wait_for_mapping` | `wait_for_manual_input` | `stay_out_data_insufficient`),
`criticalDomainReadiness`, `domainReliabilityScore` (NOT a probability),
`fetchedCriticalDomains`, `blockedCriticalDomains`, `staleCriticalDomains`,
`manualCriticalDomains`, `endpointMissingDocsDomains`, `providerNotConfiguredDomains`.

## Rules

Missing critical domain reduces readiness. Reliable manual coverage counts as manual
(mixed status). Endpoint-not-documented / provider-not-configured → provider-limited.
Readiness score is not a probability of winning. V1–V4 remain; V5 is additive.
