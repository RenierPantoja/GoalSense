# Control Plane Data Freshness

Freshness fields:

- `latestWorkerHeartbeatAt`
- `latestSessionUpdatedAt`
- `latestSnapshotAt`
- `latestDailyReportAt`
- `latestCausalCaseAt`
- `freshnessStatus`
- `staleReasons`
- `nextExpectedUpdate`
- `lagMs`
- `limitations`

Statuses:

- `fresh`: latest operational update is within the expected polling window.
- `slightly_stale`: visible, but delayed.
- `stale`: old enough that active state should be treated cautiously.
- `empty`: no persisted state visible.
- `unknown`: malformed or insufficient timestamps.

Freshness is visibility only. It is not probability, not confidence, and not a promise of accuracy.
