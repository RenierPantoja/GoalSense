# ESPN Live-First Leases And Locks

Fixture leases prevent two local worker runs from monitoring the same ESPN fixture at the same time.

## Lease Fields

- `fixtureId`
- `sessionId`
- `workerRunId`
- `acquiredAt`
- `heartbeatAt`
- `leaseExpiresAt`
- `status`
- `owner`
- `limitations`

Valid statuses are `active`, `released`, `expired`, `completed`, and `orphaned`.

## Rules

- A fixture with an active, unexpired lease cannot be acquired by another worker.
- A lease is renewable only by the owning `workerRunId`.
- Expired leases can be marked `expired` or `orphaned` and then recovered.
- Releasing a lease does not resolve an outcome.
- Noop mode warns that it has no crash-resumable distributed lock.

Defaults:

- `ESPN_LIVE_FIRST_LEASE_TTL_SECONDS=120`
- `ESPN_LIVE_FIRST_HEARTBEAT_SECONDS=30`
- `ESPN_LIVE_FIRST_MIN_POLL_INTERVAL_SECONDS=30`
