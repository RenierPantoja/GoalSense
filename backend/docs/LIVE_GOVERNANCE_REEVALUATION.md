# Live Governance Re-evaluation (B47 / Bloco 4)

`governance/liveGovernanceReevaluation.service.ts`. Re-evaluates governance decisions and
active holds when the game changes. It **never sends a real alert** and **never changes
alert results** — it only re-evaluates, records and (when a held signal would now alert)
marks `would_now_alert`. Gated by `ENABLE_ALERT_GOVERNANCE_LIVE_RECHECK`.

## Triggers
lineup_confirmed, lineup_changed, domain_refreshed, manual_record_created,
mapping_confirmed, red_card, goal, substitution, injury_event, half_time,
minute_threshold, match_status_changed, post_match_completed.

## `handleLiveTrigger(fixtureId, trigger)`
1. Detects an assumption invalidation for the trigger (auditable).
2. Re-evaluates active holds; resolves those the trigger satisfies and re-runs governance.
3. Re-evaluates fixture-level governance for the new state.
Returns a run (audited) + results + resolvedHolds + invalidations + `wouldNowAlert` ids.

The result is a record of "the game changed, here is what the brain now thinks" — purely
observational.
