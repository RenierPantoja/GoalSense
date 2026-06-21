# Governance Policy (B47 / Bloco 4)

`governance/alertGovernancePolicy.service.ts` — PURE. Centralizes WHEN to allow /
monitor / wait / downgrade / block / stay-out, deterministically from already-computed
inputs (Readiness V7 status, Precheck V7 decision, InfluenceAggregate band/score/
confidence, blocker/wait/live counts, conflicts, missing critical domains).

## Allow strong only when
readiness not blocked; influence not contradictory/blocked; no critical blockers; no
`operator_review` conflict; no critical wait_for_lineup; no uncompensated missing critical
domain; precheck not `avoid`; confidenceOfAssessment not unknown/low (else monitor).

## Monitor only when
influence mixed/weak; memory weak; partial data; medium/low reliability; context caution.

## Wait when
lineup pending (window); critical domain pending; mapping pending; manual review pending;
live confirmation required.

## Block / stay-out when
blocking conflict (`operator_review`); influence contradictory; readiness insufficient;
critical provider/manual conflict; strong misleading sample; pattern-context stay_out;
critical blocking variable.

## Mode resolution & safety
`getGovernanceMode()` returns observe unless governance enabled; `enforce` requires
`ENABLE_ALERT_GOVERNANCE_ENFORCE=true`, `shadow_block` requires
`ENABLE_ALERT_GOVERNANCE_SHADOW_BLOCK=true`; otherwise falls back to observe.
`canEnforce()` is the ONLY gate that lets a decision actually block, and `shouldBlockInEnforce`
restricts it to `block_alert`/`stay_out`. Default observe acts safely — it never blocks.

## API
`getGovernanceMode`, `getDefaultPolicy`, `evaluatePolicyInputs`, `explainPolicyDecision`,
`canEnforce`, `shouldCreateHold`, `shouldRecheckOnTrigger`, `shouldDowngradeToMonitor`,
`shouldBlockInEnforce`, `holdsEnabled`, `liveRecheckEnabled`, `holdTtlMinutes`.
