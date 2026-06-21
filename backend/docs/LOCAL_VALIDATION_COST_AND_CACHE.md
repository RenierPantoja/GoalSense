# Local Validation Cost & Cache (B49 / Bloco 6)

`validation/localValidationCache.service.ts`. Per-run, in-memory cache that avoids
expensive rebuilds within a single validation run.

## Cached per run
Package V5, Readiness V7, InfluenceAggregate (and, via those, the chain V1–V4 + memory).
`getOrBuildPackage`, `getOrBuildReadiness`, `getOrBuildInfluence` memoize; hits/misses are
counted and surfaced in the cost metrics.

## Invalidation
`invalidateFixtureCache(runId, fixtureId, reason)` clears a fixture's cached package /
readiness / influence on domain refresh, lineup change, manual record, live trigger or
mapping change. The cache is per-process and is NEVER a source of truth; it is cleared
(`clearRunCache`) when the run completes.

## Cost discipline
Cost metrics estimate Firestore reads/writes (no provider call in the validation core) and
warn when estimates are high (reduce fixtures per run). The plan engine estimates cost
up-front without calling any provider; provider calls remain guarded by ProviderUsageGuard
and only happen when API-Football is configured.
