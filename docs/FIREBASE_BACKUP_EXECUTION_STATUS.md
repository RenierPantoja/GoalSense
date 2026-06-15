# Firebase Backup / Export — Execution Status

Tracks the Firestore backup gate. Procedure: `FIREBASE_BACKUP_RUNBOOK.md`.

| Field | Value |
|-------|-------|
| projectId (masked) | `goal***892` |
| backup status | **pending** |
| executor | — (requires project owner with gcloud/Console access) |
| date/time | — |
| method | Console / GCP / `gcloud firestore export` (TBD) |
| backup location | TBD (e.g. `gs://goalsense-29892-backups/firestore/<stamp>`) |
| notes | Not executed by the agent. `gcloud`/`gsutil` are NOT installed in this environment, and the Admin SDK SA lacks export IAM roles (same permission class as the index 403). Not fabricated. Must be done before the production cutover (E10). |

## How to update

When the owner runs the export (see `FIREBASE_BACKUP_RUNBOOK.md`), fill in:
- backup status → `done`
- executor, date/time, method, backup location (bucket path; no secrets).

If an export fails, set status → `failed` and record the error summary here.

## Owner Action Required

Backup/export was **not executed** (no `gcloud`/`gsutil`; Admin SDK SA lacks
export IAM roles). The owner must run it via Console or an authorized gcloud
session — see `OWNER_GATE_ACTIONS.md` §2. After execution, fill in:

- date/time
- method (Console / gcloud)
- backup location (GCS bucket path — no secrets)
- executor
- notes

Then flip the backup gate to ✅ in `FIREBASE_DEFAULT_SWITCH_CHECKLIST.md`. Do not
mark DONE without a real export.
