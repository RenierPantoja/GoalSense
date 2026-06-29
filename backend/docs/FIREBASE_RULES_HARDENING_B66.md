# Firebase Rules Hardening — B66

## Current state (deployed)
`firestore.rules` exposes:
- **Tier 1** `controlPlanePublicSummaries` → public read (sanitized, preferred).
- **Tier 2** 7 raw telemetry collections → public read, **transitional**.
- Default-deny everywhere else; all client writes denied.

Worker writes via Admin SDK (bypasses rules).

## Why raw is still public (transitional)
The deployed Vercel `api/_firebaseControlPlaneReadDiagnostic.ts` and the optional
raw fallback still read raw collections directly. Locking them now would make the
production diagnostic report `permission_denied` before the new sanitized-reading
api code is deployed. Raw reads remain only as a documented transition.

## Target (minimal ideal) rules
Once the deployed Vercel build reads `controlPlanePublicSummaries` exclusively
(and `ENABLE_RAW_CONTROL_PLANE_READ_FALLBACK=false` confirmed in production):

```
match /controlPlanePublicSummaries/{doc} { allow read: if true;  allow write: if false; }
match /{document=**}                     { allow read: if false; allow write: if false; }
```

## Removal plan
1. Deploy the new api/ code (sanitized-first read) to Vercel.
2. Confirm `controlPlaneDataMode = sanitized_read_model` and `rawFallbackEnabled = false` in production.
3. Replace Tier 2 matches with default-deny; redeploy rules via `deployFirestoreRulesViaApi.mjs`.
4. Verify the control plane still reads everything from the sanitized collection.

## Rollback
Re-add the Tier 2 matches (current file) and redeploy rules. Worker unaffected.
