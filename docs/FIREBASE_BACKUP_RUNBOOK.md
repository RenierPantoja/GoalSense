# Firebase Backup / Export Runbook

How to back up Firestore before a default switch or any bulk operation. This is a
runbook — no destructive or export command was executed by the agent.

- **Project:** `goalsense-29892`
- **Environment:** staging/dev
- **Owner:** project owner (fill in)
- **Backup location:** a GCS bucket in the same project, e.g.
  `gs://goalsense-29892-backups/firestore/<YYYY-MM-DD-HHMM>` (do not commit bucket
  contents; no secrets in this doc).

## Export via gcloud (recommended)

```
# Authenticate once (uses your Google account or a service account with
# datastore.databases.export permission — never commit the key):
gcloud auth login
gcloud config set project goalsense-29892

# Export all collections:
gcloud firestore export gs://goalsense-29892-backups/firestore/$(date +%Y-%m-%d-%H%M)

# Or export specific collections only:
gcloud firestore export gs://goalsense-29892-backups/firestore/<stamp> \
  --collection-ids=patterns,alerts,alertResolutions,telegramChannels,signalDeliveries,patternPerformanceCounters
```

## Export via Firebase Console

Firestore → Import/Export → Export → choose destination bucket → start.

## Before a default switch

1. Run a backup/export (above) and record the bucket path + timestamp here.
2. Confirm the export completed (Console shows the operation as done).
3. Only then proceed with the switch (`FIREBASE_DEFAULT_SWITCH_CHECKLIST.md`).

## Restore (if needed)

```
gcloud firestore import gs://goalsense-29892-backups/firestore/<stamp>
```

## Status (Phase E9)

- Backup **NOT executed by the agent** (requires the owner's gcloud/Console
  access and bucket). Recorded here as the required pre-switch step. Fill in the
  date/time/bucket once performed.

## Notes

- Never commit service-account keys or bucket contents.
- High-volume collections (`liveSnapshots`, `oddsSnapshots`, `providerHealth`)
  dominate export size; selective export is fine for a config/state backup.
- `alerts` + `alertResolutions` are the performance source of truth — always
  include them in any backup taken before a migration.
