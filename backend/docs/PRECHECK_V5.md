# Precheck V5 (B44)

`runAlertDecisionPrecheckV5(fixtureId)` consumes Readiness V5 (critical data-domain
coverage). Observe-first; never blocks a real alert.

## Decisions

`avoid` | `wait_for_lineup` | `wait_for_domain_fetch` | `wait_for_mapping` |
`wait_for_manual_review` | `wait_for_live_confirmation` | `monitor` | `alert_candidate` |
`strong_alert` | `post_match_learning_only`.

## Reasons

`critical_domain_missing`, `critical_domain_stale`, `critical_domain_provider_limited`,
`injuries_unknown`, `standings_missing`, `lineup_not_confirmed`,
`real_provider_data_supports_pattern`, `manual_data_supports_pattern`, …

## Rules

`ENABLE_ALERT_DECISION_PRECHECK` default false, `ALERT_DECISION_PRECHECK_MODE` default
observe. In enforce it only reports `enforced` for wait/avoid — never wired into the
alert engine. Score/confidence/counters/results unchanged. V1–V4 remain; V5 is additive.
