# Firebase Control Plane Rules — B65

## Context
The Vercel-hosted Control Plane (read-only Backstage) reads operational telemetry
from Firestore using the **public Web App apiKey via the Firestore REST API, with
no auth token**. Until B65 the rules denied these reads → `permission_denied`.

After applying the Firebase Web App envs in Vercel Production (B65), the hosted
runtime initializes Firebase (`firebaseEnvValid=true`), but reads still returned
`permission_denied` until the rules below were applied.

## What changed
`firestore.rules` grants **public read** on exactly the collections the control
plane reads, and **denies all client writes**:

| Collection                      | Read | Client Write |
|---------------------------------|------|--------------|
| espnLiveFirstWorkerRuns         | ✅   | ❌ |
| liveMonitoringSessions          | ✅   | ❌ |
| liveMonitoringFixtureStates     | ✅   | ❌ |
| espnLiveFirstFixtureLeases      | ✅   | ❌ |
| espnLiveFirstRecoveryReports    | ✅   | ❌ |
| liveFirstPostMatchOutcomes      | ✅   | ❌ |
| dailyValidationReports          | ✅   | ❌ |
| *everything else*               | ❌   | ❌ |

## Why it is safe
- **Writes stay protected.** The local/dedicated worker writes via the Firebase
  **Admin SDK (service account)**, which bypasses Security Rules. Denying client
  writes does not affect the worker.
- **Only non-sensitive operational telemetry is exposed**: worker runs, sessions,
  fixture states, leases, recovery reports, post-match outcomes, daily reports.
  No PII, no secrets, no API keys, no odds, no user data.
- **Default-deny** for every other collection (Signal Ledger, alerts, patterns,
  intelligence memory, etc. remain fully locked to clients).
- The frontend never writes worker state and never starts a worker.

## Why public read (not auth-scoped)
The control-plane diagnostic/read model fetch the Firestore REST API with only the
public apiKey and **no Firebase Auth token**. `request.auth != null` would still
deny them. Public read on this narrow, non-sensitive set is the minimal change
that makes the read-only control plane functional.

## Deploy
Rules are version-controlled and deployed via Firebase:

```
firebase deploy --only firestore:rules
```

(Requires firebase-tools + project auth, or deploy through the Firebase Console
Rules editor using the same content.)

## Rollback
Revert `firestore.rules` to a default-deny (`allow read, write: if false;`) and
redeploy. The worker (Admin SDK) is unaffected; only the hosted read visibility
is removed.

---

## B66 Update — Sanitized public read model
The preferred public surface is now the single sanitized collection
`controlPlanePublicSummaries` (allowlisted fields only), published by the worker
via the Admin SDK. The 7 raw collections remain public **transitionally** while
the deployed Vercel diagnostic still reads them; see
`FIREBASE_RULES_HARDENING_B66.md` for the lock-down plan and
`CONTROL_PLANE_PUBLIC_READ_MODEL.md` for the read model. Client writes remain
denied on all collections, including `controlPlanePublicSummaries`.
