# ESPN Live-First Persistent Worker

B59 turns ESPN Live-First from a synchronous script into a local persistent worker. It is local-only, bounded by duration, and observational: no Telegram, no odds, no stake, no auto-bet, and no enforce changes.

## Lifecycle

1. Discover live ESPN fixtures.
2. Create a persisted `EspnLiveFirstWorkerRun`.
3. Create a persisted `LiveMonitoringSession`.
4. Create fixture states and acquire fixture leases.
5. Tick on a safe poll interval.
6. Renew worker heartbeat and fixture leases.
7. Capture snapshots, diff them, and enqueue governance rechecks only in observe mode.
8. Release a fixture lease when full-time is confirmed.
9. Run post-match live-first resolution only when a reliable final state exists.
10. Complete or complete_with_warnings when all fixtures finish or duration ends.

## Safety Rules

- ESPN live data is best-effort real data, not a full provider API.
- Missing pre-match data is a limitation.
- Momentum is not a probability.
- Unknown and not_evaluable are not failures.
- Orphaned sessions are recoverable operational states, not failed predictions.
- Worker runs do not send external alerts and do not alter alert results.

## Persistence

Firebase collections:

- `espnLiveFirstWorkerRuns`
- `espnLiveFirstFixtureLeases`
- `espnLiveFirstRecoveryReports`
- `liveMonitoringSessions`
- `liveMonitoringFixtureStates`
- `liveFirstPostMatchOutcomes`

The Noop repository keeps B59 state only in process memory for smoke tests and local Prisma mode. It is not crash-resumable and must not be treated as a real distributed lock.
