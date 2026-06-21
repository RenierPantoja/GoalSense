# Governance Holds / Watchlist (B47 / Bloco 4)

`governance/alertGovernanceHold.service.ts`. Stores signals that should NOT alert now but
must be re-evaluated when new info arrives. **A hold is not an alert**, never sends
Telegram, never a bet; it always has a TTL and a `nextRecommendedCheckAt`.

## Reasons
`lineup_pending`, `domain_pending`, `mapping_pending`, `manual_review_pending`,
`live_confirmation_pending`, `conflict_pending`.

## Lifecycle
- `createHoldFromDecision(result)` — only when `ENABLE_ALERT_GOVERNANCE_HOLDS=true` and the
  decision action is a `wait_*`. Deterministic id per (fixture, pattern, reason).
- `listActiveHoldsForFixture`, `resolveHold`, `cancelHold`, `expireOldHolds`, `explainHold`.
- TTL from `ALERT_GOVERNANCE_HOLD_TTL_MINUTES` (default 180); re-check cadence by reason
  (live 5min, lineup 15min, others 30min).

## Trigger resolution
`triggerResolvesReason(trigger, reason)` maps a live trigger to the hold reason it
satisfies (e.g. `lineup_confirmed` → `lineup_pending`, `red_card`/`goal` →
`live_confirmation_pending`, `domain_refreshed` → `domain_pending`). When a trigger
resolves a hold, the Live Re-evaluation engine re-runs governance for that signal.

The GoalSense thereby learns to **wait** instead of alerting on incomplete information.
