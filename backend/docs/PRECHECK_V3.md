# Precheck V3 (B41)

`runAlertDecisionPrecheckV3(fixtureId)` (in `alertDecisionPrecheck.service.ts`) consumes
provider + manual data, merge conflicts, Readiness V3, lineup window V2, squad V2 and
player importance. Observe-first; never blocks a real alert.

## Decisions

`avoid`, `wait_for_lineup`, `wait_for_manual_review`, `wait_for_live_confirmation`,
`monitor`, `alert_candidate`, `strong_alert`, `post_match_learning_only`.

## New reasons

`manual_data_supports_pattern`, `manual_data_conflicts_with_provider`,
`trusted_lineup_confirmed`, `lineup_conflict`, `injury_report_unavailable`,
`suspension_report_unavailable`, `key_absence_confirmed`, `key_return_confirmed`,
`provider_unconfigured_for_critical_domain`, plus the V2 fundamentals_* /memory_* flags.

## Logic (advisory)

post_match → learning only; conflict/review → wait_for_manual_review; lineup pending →
wait_for_lineup; live without stats → wait_for_live_confirmation; stay_out readiness →
avoid; provider_limited → monitor; ready (provider or manual) → alert_candidate; else
monitor.

## Modes

`ENABLE_ALERT_DECISION_PRECHECK` (default false), `ALERT_DECISION_PRECHECK_MODE`
(default observe). In enforce it only **reports** `enforced` for wait/avoid — it is not
wired into the alert engine. Score/confidence/counters/results unchanged. V1/V2 remain.
