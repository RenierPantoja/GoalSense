# Post-Match Explanation V3 (B44)

`buildPostMatchExplanationV3(fixtureId)` adds data-domain failure analysis on top of V1/V2.

## Added fields

`domainsAvailableBeforeAlert`, `domainsMissingBeforeAlert`, `domainsStaleBeforeAlert`,
`missingDomainContributedToError`, `staleDataContributedToError`,
`shouldHaveWaitedForDomain`, `shouldHaveUsedManualIntake`, `providerLimitationWasCritical`,
`domainRefinementCandidates`.

## Logic

Reads the critical-domain snapshots that existed before the match. On a `failed`
outcome WITHOUT evidence of an extreme event (so not variance/shock), missing or stale
critical domains are flagged as a possible cause → acquisition refinement candidates
(e.g. "fetch injuries/standings before alerting"). Errors become acquisition
improvements, not just pattern blame.

## Rules

A miss is never called random without evidence (inherited from V1). Domain absence is a
candidate cause, not a certainty. unknown/expired/pending are never failures. V1/V2
remain; V3 is additive.

## Extended by Post-Match V4 (B45)

`buildPostMatchExplanationV4` adds memory-aware learning fields: memorySupportedOutcome,
memoryContradictedOutcome, memoryWasMisleading, sampleWasTooWeak, tabooWasInvalid,
similarScenarioWasUseful, memoryRefinementCandidates. Same discipline: a miss is not
"random" without evidence; weak/old samples are named as sample problems, not pattern
failures; unknown/not_evaluable/pending are never failures. See
`POST_MATCH_MEMORY_ANALYSIS.md`.
