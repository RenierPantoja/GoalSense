# B63 Vercel Firebase Env Audit

1. Vercel production needs `VITE_FIREBASE_PROJECT_ID` and `VITE_FIREBASE_API_KEY` for the current control-plane REST reads.
2. Public VITE variables are Firebase Web config: project id, API key, auth domain, app id, storage bucket, and messaging sender id.
3. Firebase Admin service account JSON/base64/private key, client email, backend API keys, tokens, and `.env` files must never go to the client.
4. The Vercel control plane uses Firebase Web config plus Firestore REST reads, not Admin SDK.
5. Vercel only needs read access for the control plane.
6. Read collections: `espnLiveFirstWorkerRuns`, `liveMonitoringSessions`, `espnLiveFirstFixtureLeases`, `liveMonitoringFixtureStates`, `dailyValidationReports`, `liveFirstPostMatchOutcomes`, and recovery reports.
7. Firebase Rules must allow the expected read context and block frontend writes to operational collections.
8. The panel now shows missing Firebase public env separately from empty data.
9. Status differentiates `missing_firebase_env`, `firebase_permission_denied`, `empty_firestore`, stale, and fresh.
10. B62 `freshness=empty` was caused by missing Vercel Firebase public env, not proven empty Firestore.
