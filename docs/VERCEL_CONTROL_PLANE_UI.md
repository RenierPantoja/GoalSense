# Vercel Control Plane UI

Backstage shows runtime mode for ESPN Live-First worker operations.

In Vercel:

- status is visible;
- worker runs are visible when persisted read access is available;
- leases and recovery reports are visible;
- daily report and causal cases are visible;
- start/stop/resume/recovery/post-match buttons are disabled.

In local worker/runtime:

- commands may be enabled by environment flags;
- long worker windows must be run outside Vercel.

The UI is a renderer/control plane, not the worker runtime.

B62 adds freshness display and production visual checklist coverage. The UI remains a display layer and does not compute patterns, events, governance, outcomes, or probability.
