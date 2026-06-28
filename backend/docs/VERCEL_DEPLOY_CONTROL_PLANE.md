# Vercel Deploy Control Plane

GoalSense uses Vercel as a hosted UI and lightweight read-only control plane.

Vercel responsibilities:

- render UI and Backstage panels;
- expose health/runtime/status/readiness routes;
- read persisted worker/session/report state;
- show limitations and runtime mode;
- block long-running worker commands unless explicitly configured otherwise.

On the Vercel Hobby plan, the control-plane URLs are served through the consolidated `api/misc.ts` function via rewrites. The public URLs remain `/api/runtime`, `/api/worker-control-plane/status`, and `/api/worker-control-plane/readiness`, but they do not add extra serverless functions.

Vercel does not:

- start persistent ESPN Live-First workers;
- run 90+ minute loops;
- hold fixture leases;
- renew heartbeats;
- run post-match sweeper writes by default;
- enable odds, Telegram, stake, auto-bet, or enforce.

Persistent worker responsibilities stay local/dedicated:

- discover ESPN live fixtures;
- capture snapshots;
- renew leases and heartbeat;
- persist sessions and fixture states;
- run recovery and post-match sweeper;
- create live-first causal cases.
