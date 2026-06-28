# Runtime Environment Guard

The runtime guard separates hosted control-plane behavior from worker runtime behavior.

Runtime values:

- `local_worker`
- `local_dev`
- `vercel_preview`
- `vercel_production`
- `unknown`

Environment flags:

- `GOALSENSE_RUNTIME=vercel_control_plane | local_worker | local_dev`
- `ENABLE_VERCEL_WORKER_COMMANDS=false`
- `ENABLE_LOCAL_WORKER_COMMANDS=true`

B62 confirms Vercel production remains read-only during E2E drills. Status/readiness reads are allowed; persistent worker commands remain blocked.

B63 keeps the same command boundary while adding Firebase public env diagnostics.

Rules:

- Vercel preview/production blocks persistent worker commands by default.
- Local worker allows start/stop/recovery/post-match commands when enabled.
- Local dev can read status and perform limited safe stop/recovery actions.
- Unknown runtime blocks persistent worker commands.

Read-only operations remain allowed:

- read status;
- read reports;
- read sessions;
- readiness checks.
