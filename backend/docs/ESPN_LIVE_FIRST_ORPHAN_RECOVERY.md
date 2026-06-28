# ESPN Live-First Orphan Recovery

An orphaned session is a running live-first session whose worker heartbeat or leases are no longer current.

## Detection

A session is considered orphan-like when:

- session status is `running`;
- no active leases exist, or active leases are expired;
- fixture state has no recent update;
- the worker run is missing, expired, or no longer owned by the current process.

## Actions

- If the fixture can still be monitored, the worker can be resumed from persisted session and fixture state.
- If the fixture is already final and final state is persisted, recovery can close the session and leave it for post-match sweeping.
- If ESPN data is unavailable, the session becomes `completed_with_warnings`.
- If there is no reliable data, the recovery report records the unresolved reason.

Recovery never invents snapshots, final score, full-time status, injuries, suspensions, lineups, or causal outcomes.
