# B63 Firebase Rules Control Plane Read Check

Expected read collections:

- `espnLiveFirstWorkerRuns`
- `espnLiveFirstFixtureLeases`
- `liveMonitoringSessions`
- `liveMonitoringFixtureStates`
- `dailyValidationReports`
- `validationCampaigns`
- `liveFirstPostMatchOutcomes`
- `espnLiveFirstRecoveryReports`
- governance result collections if surfaced by the read model

Rules should allow the expected control-plane read context and block frontend writes to worker/session/lease/report collections.

If env is valid but Vercel still cannot read, check:

- Firebase Rules permission denied;
- project id mismatch;
- wrong Web API key;
- collections genuinely empty;
- missing indexes or bad query;
- stale deploy/environment scope.
