# Live Monitoring Session

Live monitoring sessions are persisted in `liveMonitoringSessions`; fixture state is persisted in `liveMonitoringFixtureStates`.

A session can be `running`, `completed`, `completed_with_warnings`, `failed`, or `cancelled`. In B59, stale running sessions with expired leases are orphan candidates. Orphan does not mean failed.
