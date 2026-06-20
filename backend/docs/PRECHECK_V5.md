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

## Extended by Precheck V6 (B45)

`runAlertDecisionPrecheckV6` adds memory-aware reasons (team_memory_positive,
memory_contradicts_pattern, stay_out_memory_misleading, memory_insufficient_history,
matchup_memory_supported/insufficient). Still observe-first and flag-gated; memory
never hard-blocks — even in enforce only `wait_*` is enforceable intent and nothing is
wired into the alert engine. See `MEMORY_AWARE_PRECHECK.md`.
