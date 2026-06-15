# Owner Gate Actions

Actions the **project owner** must perform outside the codebase to close the
remaining production gates. These cannot be done by the agent (they need owner
auth / IAM / Console access). Nothing here is a code change.

Project: `goalsense-29892` (masked elsewhere as `goal***892`).

---

## 1. Deploy the Firestore indexes

The agent attempted this and got **HTTP 403** because the Firebase Admin SDK
service account lacks index-deploy permission (see
`FIRESTORE_INDEX_DEPLOY_STATUS.md`). Choose ONE:

**Option A — deploy as the owner (recommended, simplest):**
```
cd <repo root>            # firebase.json + firestore.indexes.json live here
npx firebase-tools login
npx firebase-tools deploy --only firestore:indexes --project goalsense-29892
```

**Option B — grant the service account the roles, then CI-deploy:**
In GCP IAM, grant the SA (`...firebase-adminsdk...@goalsense-29892.iam.gserviceaccount.com`):
- `Cloud Datastore Index Admin` (`roles/datastore.indexAdmin`)
- `Service Usage Consumer` (`roles/serviceusage.serviceUsageConsumer`)

Then:
```
# Windows PowerShell
$env:GOOGLE_APPLICATION_CREDENTIALS = "<absolute path to the SA json>"
npx firebase-tools deploy --only firestore:indexes --project goalsense-29892 --non-interactive
```

After it succeeds, paste the output summary into `FIRESTORE_INDEX_DEPLOY_STATUS.md`
and flip that gate to ✅ in `FIREBASE_DEFAULT_SWITCH_CHECKLIST.md`.

> Not strictly blocking staging today — adapters query single-equality + sort in
> memory, so no composite index is required yet. Needed before scaling server-side
> ordering/limits.

---

## 2. Backup / export Firestore

`gcloud`/`gsutil` are not installed in the dev box and the Admin SDK SA lacks
export roles. Do it via the **Console** or an authorized **gcloud** session:

**Console:** Firestore → Import/Export → Export → choose a GCS bucket in the
project → start. Wait for completion.

**gcloud:**
```
gcloud auth login
gcloud config set project goalsense-29892
gcloud firestore export gs://goalsense-29892-backups/firestore/$(date +%Y-%m-%d-%H%M)
```

Then fill in `FIREBASE_BACKUP_EXECUTION_STATUS.md` (date/time, method, bucket
location, executor) and flip that gate to ✅. Always include `alerts` +
`alertResolutions` (performance source of truth).

---

## 3. Live-rich validation window

Run the observe-only watcher during real live football (no fake data is ever
created). Backend must be in firebase mode with workers enabled
(`LIVE_WORKER_ENABLED=true`, `PATTERN_WORKER_ENABLED=true`,
`RESOLUTION_WORKER_ENABLED=true`).

```
cd backend
npm run watch:live:long          # 4h window, 60s interval, JSON output
# or a custom window:
npm run watch:live -- --duration 120 --interval 60 --json
```

Recommended duration: 2–4 hours over a window with live matches (weekend/evening
UTC). Watch for `bestObserved` reaching `LIVE_RICH_DATA` and
`alertsCreatedDuringWindow` / `resolvedDuringWindow` > 0 (real worker activity).

When real rich data + alerts + resolutions are observed, record the evidence in
`FIREBASE_LIVE_WORKER_VALIDATION_REPORT.md` / `LIVE_VALIDATION_WATCH_REPORT.md`
and flip the worker gates. Do **not** create a fake alert to "complete" the gate.

---

## Gate status summary

See `FIREBASE_DEFAULT_SWITCH_CHECKLIST.md` (GO/NO-GO). Production cutover stays
**NO-GO** until (1) indexes deployed, (2) backup taken, and (3) workers validated
on a live-rich window — or these are formally accepted as conscious risk by the owner.
