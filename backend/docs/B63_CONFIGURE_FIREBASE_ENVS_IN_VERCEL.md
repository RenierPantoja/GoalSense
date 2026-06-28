# B63 Configure Firebase Envs In Vercel

Dashboard steps:

1. Open Vercel Dashboard.
2. Select GoalSense.
3. Go to Settings -> Environment Variables.
4. Add Production values for `VITE_FIREBASE_PROJECT_ID` and `VITE_FIREBASE_API_KEY`.
5. Add the optional `VITE_FIREBASE_*` values only if the frontend/auth path requires them.
6. Do not add service account JSON, private key, `.env` contents, or backend secrets.
7. Redeploy production.
8. Validate:
   - `/api/runtime`
   - `/api/worker-control-plane/firebase-env`
   - `/api/worker-control-plane/firebase-read-diagnostic`
   - `/api/worker-control-plane/status`
   - `/api/worker-control-plane/readiness`

CLI option, without documenting values:

```bash
vercel env add VITE_FIREBASE_PROJECT_ID production
vercel env add VITE_FIREBASE_API_KEY production
```
