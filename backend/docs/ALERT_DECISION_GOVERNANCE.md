# Alert Decision Governance (B47 / Bloco 4)

The single, auditable decision door that connects the fundamental intelligence
(Package V5, Readiness V7, Precheck V7, InfluenceAggregate, conflicts) to the real alert
flow — in shadow/observe by default, **never blocking a real alert** unless explicit
enforce is enabled.

## Files (`modules/footballIntelligence/governance/`)
- `alertDecisionGovernance.types.ts` — contracts.
- `alertGovernancePolicy.service.ts` — PURE policy (mode + allow/monitor/wait/block).
- `alertDecisionGovernor.service.ts` — the door: compose influence + Readiness V7 +
  Precheck V7 → policy → result (+ optional hold). Non-fatal.
- `alertGovernanceHold.service.ts` — holds/watchlist (TTL + nextRecommendedCheckAt).
- `liveGovernanceReevaluation.service.ts` — re-evaluate on live triggers.
- `assumptionInvalidation.service.ts` — detect when a pre-match reading no longer holds.

## Modes (observe vs shadow vs enforce)
- `observe` (default) / `shadow` / `shadow_block` → advisory; record only; never block.
- `shadow_block` → marks `wouldHaveBlocked` but `actuallyBlocked=false`.
- `enforce` → ultra-conservative; only with `ENABLE_ALERT_GOVERNANCE_ENFORCE=true` AND
  `ALERT_GOVERNANCE_MODE=enforce`; blocks only hard `block_alert`/`stay_out`.
- Invalid/insufficiently-flagged modes fall back to `observe`.

## Decisions
allow_alert / allow_monitor_only / wait_for_lineup / wait_for_domain_fetch /
wait_for_mapping / wait_for_manual_review / wait_for_live_confirmation /
downgrade_to_monitor / block_alert / stay_out / post_match_learning_only / no_decision.

## Shadow wiring
- Command pattern flow (`commandEvaluation.service`): post-create shadow record.
- Auto Engine opportunities (`autoEngine.service`): advisory after upsert.
- Promoted opportunity (`autoOpportunityAlertPromotion.service`): shadow on promotion
  (human override remains; the decision is recorded for audit).

## Persistence
Firebase: `alertDecisionGovernanceResults`, `alertGovernanceHolds`, `alertGovernanceRuns`,
`assumptionInvalidations`. Noop under Prisma (shadow still computes; nothing stored).

## Inviolable rules
A decision is NOT a probability and NOT a promise; observe/shadow never blocks a real
alert; enforce is flag-gated and conservative; holds expire; live recheck never sends an
alert and never changes alert results; conflicts are explicit; overrides are audited;
score/confidence/counters/patterns/alert results are untouched.
