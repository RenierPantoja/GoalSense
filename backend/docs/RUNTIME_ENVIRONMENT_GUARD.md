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
