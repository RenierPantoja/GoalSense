# ESPN Live-First Worker Panel

The Backstage worker panel shows local operational state for the persistent ESPN Live-First worker:

- worker runs;
- active sessions;
- active fixture leases;
- heartbeat;
- snapshots;
- governance rechecks;
- orphan sessions;
- completed fixtures;
- post-match pending work;
- recovery reports;
- limitations.

Actions:

- Start worker;
- Stop worker;
- Resume worker;
- Run recovery sweep;
- Run post-match sweeper;
- Refresh status.

The panel intentionally does not show odds, probabilities, stake, auto-bet controls, Telegram delivery, or enforce controls.

## B61 Hosted UI Behavior

In Vercel, the panel displays `Vercel Control Plane` or `Vercel Preview` and disables start/stop/resume/recovery/post-match controls. In local worker mode, controls follow the runtime guard and environment flags.
