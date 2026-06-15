# Firestore Index Deploy — Execution Status

Tracks the composite-index deploy gate. Definitions: `firestore.indexes.json`
(repo root, referenced by `firebase.json`). Reference:
`backend/firestore.indexes.recommended.json`.

| Field | Value |
|-------|-------|
| Firebase CLI | **available via `npx firebase-tools`** (v15.20.0); not globally installed |
| `firebase.json` | created (points to `firestore.indexes.json`) |
| indexes status | **FAILED — permission denied (not deployed)** |
| auth method tried | `GOOGLE_APPLICATION_CREDENTIALS` = `firebase-adminsdk` service account |
| date/time | 2026-06-15 ~23:10 UTC |
| command | `npx firebase-tools deploy --only firestore:indexes --project goalsense-29892 --non-interactive` |
| result | `HTTP 403 — Permission denied to get service [firestore.googleapis.com]` (serviceusage). The Admin SDK service account lacks index/deploy IAM roles. |
| runtime impact | none — no composite-index error occurs; adapters use single-equality + in-memory sort |

## Why it failed (honest)

The `goalsense-29892-firebase-adminsdk-...` service account is the **Firebase Admin
SDK** SA — intended for Firestore DATA access, not infrastructure deploys. Deploying
indexes needs roles such as `roles/datastore.indexAdmin` and
`serviceusage.services.get` (Service Usage Consumer), which this SA does not have.
No success was fabricated.

## How to deploy (owner action)

Option A — deploy with an authenticated owner account:
```
npx firebase-tools login
npx firebase-tools deploy --only firestore:indexes --project goalsense-29892
```

Option B — grant the service account the needed roles, then re-run the CI deploy:
```
# In GCP IAM, grant the SA: Cloud Datastore Index Admin + Service Usage Consumer
$env:GOOGLE_APPLICATION_CREDENTIALS = "<path to SA json>"
npx firebase-tools deploy --only firestore:indexes --project goalsense-29892 --non-interactive
```

Record the output, success/failure, and date here once done.

## Why not blocking staging

Adapters query with a single equality filter and sort/filter in memory, so
Firestore does not require these composite indexes yet. They become necessary when
adapters move to server-side ordering/limits at scale (post-cutover optimization).

## Owner Action Required

- **Observed error (real):** `HTTP 403 — Permission denied to get service
  [firestore.googleapis.com]` when deploying with the Admin SDK service account.
- **Probable cause:** the service account lacks index-deploy / Service Usage roles.
- **Resolution options (see `OWNER_GATE_ACTIONS.md` §1):**
  - Option A — owner runs `npx firebase-tools login` then `... deploy --only firestore:indexes`.
  - Option B — grant the SA `Cloud Datastore Index Admin` + `Service Usage Consumer`, then re-run the non-interactive deploy.
- **Do not mark this gate DONE until a real successful deploy output is recorded here.**
