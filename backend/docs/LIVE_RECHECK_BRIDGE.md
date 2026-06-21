# Live Re-evaluation Bridge (B49 / Bloco 6)

`validation/localLiveReevaluationBridge.service.ts`. Safely connects the live monitor to
governance re-evaluation — addressing the B47 "live recheck is on-demand only" limitation
WITHOUT risk.

## Safety
- OFF by default (`ENABLE_LOCAL_LIVE_RECHECK_BRIDGE=false`).
- Rate-limited per fixture (`LOCAL_LIVE_RECHECK_MIN_INTERVAL_SECONDS`, default 60).
- Observe mode (`LOCAL_LIVE_RECHECK_BRIDGE_MODE=observe`).
- It NEVER sends an alert and NEVER blocks one — it only re-evaluates governance/holds via
  the B47 `handleLiveTrigger`. Non-fatal.

## Flow
`onLiveSnapshotCaptured(snapshot, previous)` → `detectRelevantLiveTriggers` (PURE: goal,
red_card, match_status_changed, half_time, post_match_completed from snapshot deltas) →
`enqueueGovernanceRecheck` (rate-limited) → `processRecheckQueue()` drains the queue.
`explainLiveRecheckBridgeStatus()` reports enabled/mode/interval/queued.

When disabled, `enqueueGovernanceRecheck` returns false and nothing is processed.
