# Local Worker With Vercel Control Plane

Recommended operation:

1. Vercel hosts the UI/control plane.
2. ESPN Live-First worker runs locally or on a dedicated machine.
3. Worker writes sessions, snapshots, leases, recovery reports, daily reports, and causal cases to Firebase.
4. Vercel reads status and reports.
5. Long commands are executed through local CLI.
6. Future migration can move the worker to a VPS/dedicated runtime.

Local commands:

```bash
node scripts/startEspnLiveFirstWorker.mjs
node scripts/getEspnLiveFirstWorkerStatus.mjs
node scripts/runEspnLiveFirstRecoverySweep.mjs
node scripts/runEspnLiveFirstPostMatchSweeper.mjs
node scripts/runTodayDailyReport.mjs
```

Vercel validation:

```bash
curl https://goal-sense.vercel.app/api/health
curl https://goal-sense.vercel.app/api/runtime
curl https://goal-sense.vercel.app/api/worker-control-plane/status
curl https://goal-sense.vercel.app/api/worker-control-plane/readiness
```

B62 drill:

```bash
node scripts/runControlPlaneE2EDrill.mjs --duration 10 --max-fixtures 2 --poll 45
```

The drill confirms Vercel read-only status, local worker persistence, control-plane freshness, and daily-report visibility.

If the Vercel panel remains empty, run:

```bash
node scripts/checkVercelFirebaseControlPlane.mjs https://goal-sense.vercel.app
```

`missing_firebase_env` means the Vercel project needs the Firebase Web envs configured in Production.

Safety:

- no odds;
- no Telegram;
- no auto-bet;
- no stake;
- enforce remains off;
- no ESPN live data is invented.
