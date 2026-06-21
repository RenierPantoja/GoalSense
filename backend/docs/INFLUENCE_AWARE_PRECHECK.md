# Influence-Aware Readiness & Precheck (B46 / Bloco 3)

## Readiness V7 — `buildFundamentalReadinessV7(fixtureId)`
(appended to `fundamentalReadinessEngine.service.ts`)

States: `ready_with_supportive_influence`, `ready_but_mixed_influence`,
`wait_due_to_influence`, `blocked_by_influence`, `insufficient_influence_data`,
`live_confirmation_required_by_influence`.

Exposes blockerCount, waitInfluenceCount, contradictionCount, supportiveInfluenceCount,
liveConfirmationCount, missingCriticalInfluenceDomains, netInfluenceBand,
influenceConfidenceOfAssessment. `influenceReadiness` is data/weight confidence, **not a
probability**; influence-ready ≠ alert; blocking reduces readiness; wait recommends waiting.

## Precheck V7 — `runAlertDecisionPrecheckV7(fixtureId)`
(appended to `alertDecisionPrecheck.service.ts`)

Uses the InfluenceAggregate. Decisions: avoid / wait_for_lineup / wait_for_domain_fetch /
wait_for_mapping / wait_for_manual_review / wait_for_live_confirmation / monitor /
alert_candidate / strong_alert / post_match_learning_only.

New reasons: influence_strongly_supportive, influence_mixed, influence_contradictory,
influence_blocked, influence_requires_wait, influence_requires_live_confirmation,
high_reliability_support, low_reliability_support, conflict_requires_review.

Default `observe`; flag-gated; **never blocks a real alert** and never alters the real
engine. Even in enforce only `avoid`/`wait_*` is enforceable intent and nothing is wired
into the alert engine.

## DecisionInputLedger V2
`buildDecisionInputs` accepts `influenceAssessments` + `influenceAggregate` and emits
deterministic-id inputs: variable_supports_pattern, variable_contradicts_pattern,
variable_blocks_pattern, variable_requires_wait, variable_requires_live_confirmation,
variable_uncertain, influence_aggregate_summary. Explanatory, never the final decider.

## Wired into governance (B47)

Precheck V7's decision feeds the Alert Decision Governor (B47) as one of its inputs
(alongside Readiness V7 and the InfluenceAggregate). The governor — not the precheck — is
the single decision door, and it stays observe/shadow by default. See
`ALERT_DECISION_GOVERNANCE.md`.
