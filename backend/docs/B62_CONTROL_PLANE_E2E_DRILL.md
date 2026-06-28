# B62 Control Plane E2E Drill

Run:

```bash
cd backend
npm run build
node scripts/runControlPlaneE2EDrill.mjs --duration 10 --max-fixtures 2 --poll 45
```

The script checks Vercel health/runtime/status/readiness, confirms read-only command blocking, starts the local worker, polls local and Vercel status, stops the worker gracefully, runs recovery/post-match/daily report, and prints a safe summary.

It never starts worker commands from Vercel and never prints secrets.
