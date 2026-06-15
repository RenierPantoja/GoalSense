# Firestore Index Deploy — Execution Status

Tracks the composite-index deploy gate. Definitions: `firestore.indexes.json`
(repo root). Reference: `backend/firestore.indexes.recommended.json`.

| Field | Value |
|-------|-------|
| Firebase CLI | **unavailable** in this environment (`firebase --version` → command not found) |
| indexes status | **pending deploy** |
| indexes file | `firestore.indexes.json` ready (alerts, liveSnapshots, fixtures, signalDeliveries, oddsSnapshots) |
| runtime impact | none — no composite-index error has occurred; adapters use single-equality + in-memory sort |
| date/time | — |
| notes | Not deployed by the agent (CLI not installed). Not fabricated. Required before scaling server-side `where + orderBy + limit`. |

## Deploy command (when CLI is configured for the project)

```
firebase login
firebase use goalsense-29892
firebase deploy --only firestore:indexes
```

Then record here: output summary, success/failure, date/time, and which indexes
were created/were already present.

## Why not blocking staging

The adapters currently query with a single equality filter and sort/filter in
memory, so Firestore does not require these composite indexes yet. They become
necessary when adapters are switched to server-side ordering/limits at scale
(post-cutover optimization).
