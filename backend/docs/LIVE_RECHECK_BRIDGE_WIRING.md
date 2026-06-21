# Live Recheck Bridge Wiring (B50)

The B49 `localLiveReevaluationBridge` is now wired into the live monitor — safely.

## Wiring point
`modules/live/liveMonitor.service.ts → captureLiveSnapshot()`: after the snapshot is
persisted, IF `ENABLE_LOCAL_LIVE_RECHECK_BRIDGE=true`, the monitor:
1. read the previous snapshot (only when the bridge is enabled, to avoid an extra read otherwise);
2. calls `onLiveSnapshotCaptured(created, previous)` (fire-and-forget, `.catch` → never breaks
   the monitor);
3. drains the recheck queue via `processRecheckQueue()`.

## Safety
- OFF by default; the wiring is a no-op when the flag is false (no extra read, no call).
- Rate-limited per fixture (`LOCAL_LIVE_RECHECK_MIN_INTERVAL_SECONDS`, default 60).
- Observe-only: it only re-evaluates governance/holds (B47 `handleLiveTrigger`); it NEVER
  sends an alert and NEVER blocks one, never changes alert results.
- Non-fatal: any error is swallowed so the live monitor keeps running.

## Smoke
`scripts/smokeLiveRecheckBridgeWiring.mjs` verifies OFF-by-default, no enqueue/process when
off, pure delta-based trigger detection (goal / red_card / status / half-time / full-time),
no spurious trigger on no-change, and null-safe behavior.
