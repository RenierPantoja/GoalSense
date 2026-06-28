# Vercel Deploy Verification Runbook

1. Confirm the GitHub push reached `origin/main`.
2. Open the Vercel deployment for the latest commit.
3. Check Vercel build logs.
4. Open the frontend URL.
5. Call `GET /api/health`.
6. Call `GET /api/runtime`.
7. Call `GET /api/worker-control-plane/status`.
8. Call `GET /api/worker-control-plane/readiness`.
9. Confirm runtime is `vercel_preview` or `vercel_production`.
10. Confirm `isReadOnlyControlPlane=true`.
11. Confirm `startWorker.allowed=false`.
12. Confirm no persistent worker process started from Vercel.
13. Run the worker locally or in a dedicated runtime.
14. Confirm the hosted UI reads persisted worker data.
15. Confirm daily report and causal cases are visible when Firestore read is available.

CLI:

```bash
VERCEL_DEPLOY_URL=https://goal-sense.vercel.app node scripts/checkVercelDeployHealth.mjs
```
