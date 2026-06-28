# Vercel Deploy Control Plane Audit

Status date: 2026-06-28
Commit under verification: 8c5282b

## Findings

1. The Vercel deployment is up: `https://goal-sense.vercel.app/` returned HTTP 200.
2. The deployed `/api/health` route returned HTTP 200 on the pre-B61 deployment.
3. The pre-B61 deployment did not expose `/api/runtime`; it returned 404. B61 adds it.
4. The Vercel root build is Vite frontend plus lightweight `api/` functions.
5. Vercel must not start the persistent ESPN Live-First worker.
6. Persistent worker scripts remain CLI/local or dedicated runtime operations.
7. Firebase Admin is isolated to the backend package; Vercel serverless uses no service account.
8. Hosted UI can read persisted status through read-only control-plane routes when public Firebase read env is configured.
9. Hosted UI must disable start/resume/recovery/post-match long commands when runtime is Vercel.
10. Read-only commands allowed in Vercel: health, runtime, status, readiness, reports.
11. Safe boundary: Vercel reads and renders; local/dedicated worker runs loops and writes Firebase.

## Exposed Lightweight Routes

- `GET /api/health`
- `GET /api/runtime`
- `GET /api/worker-control-plane/status`
- `GET /api/worker-control-plane/readiness`

## Blocked In Vercel

- start persistent worker
- resume persistent worker
- long polling loop
- recovery sweep write path
- post-match sweeper write path
- live monitoring session long run

## Limitations

- Vercel deploy verification depends on GitHub/Vercel completing the next deployment after B61 is pushed.
- Public Firebase read model can return `firebase_public_read_failed_*` if Firestore rules do not allow read access.
- Vercel is not a durable 90+ minute worker runtime.
