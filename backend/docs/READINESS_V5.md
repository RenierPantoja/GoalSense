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

## Superseded/extended by Readiness V6 (B45)

`buildFundamentalReadinessV6` adds the historical-memory dimension on top of V5's
critical-domain readiness. New states: `ready_with_memory_support`,
`ready_but_memory_weak`, `insufficient_memory`, `memory_contradicts_pattern`,
`memory_requires_live_confirmation`, `stay_out_memory_misleading`. The
`memoryReadinessScore` is data-confidence of memory, NOT a win probability. See
`MEMORY_AWARE_PRECHECK.md`.

## Extended by Readiness V6 (B45) and V7 (B46)

- V6 adds historical-memory readiness (see `MEMORY_AWARE_PRECHECK.md`).
- V7 (`buildFundamentalReadinessV7`) adds influence readiness: states
  `ready_with_supportive_influence`, `ready_but_mixed_influence`, `wait_due_to_influence`,
  `blocked_by_influence`, `insufficient_influence_data`,
  `live_confirmation_required_by_influence`. `influenceReadiness` is weight/assessment
  confidence, NOT a probability. See `INFLUENCE_AWARE_PRECHECK.md`.
