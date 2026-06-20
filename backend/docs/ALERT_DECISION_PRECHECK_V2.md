# Alert Decision Precheck V2 (B40)

`runAlertDecisionPrecheckV2(fixtureId)` (in `alertDecisionPrecheck.service.ts`) consults
the Match Intelligence Package + Readiness V2 + Lineup Window + provider coverage +
internal memory, and emits a richer advisory decision. Still **observe-first** and
**never blocks a real alert** (not wired into the alert engine).

## Decisions

`avoid`, `wait_for_lineup`, `wait_for_injury_suspension_update`,
`wait_for_live_confirmation`, `monitor`, `alert_candidate`, `strong_alert`,
`post_match_learning_only`.

## Reason flags

`lineup_pending`, `key_absence_unknown`, `provider_missing_injuries`,
`provider_missing_suspensions`, `h2h_insufficient`, `context_high_volatility`,
`knockout_context_requires_caution`, `derby_requires_caution`,
`fundamentals_support_pattern`, `fundamentals_contradict_pattern`,
`memory_supports_pattern`, `memory_contradicts_pattern`.

## Output

`decision`, `reasons`, `positiveFactors`, `negativeFactors`, `uncertaintyFactors`,
`stayOutReasons`, `mode`, `enabled`, `enforced` (only true in enforce mode for
wait/avoid — and even then only reported, never applied), `limitations` (includes the
provider coverage %).

## Modes & flags

`ENABLE_ALERT_DECISION_PRECHECK` (default false), `ALERT_DECISION_PRECHECK_MODE`
(default observe). The V1 precheck remains for the B39 surface; V2 is additive.

## Honesty rules

Pending lineup → wait, not an empty alert. Missing injuries/suspensions providers are
surfaced as `provider_missing_*` (not "no injuries"). Score/confidence/counters/results
unchanged. Observe never blocks a real alert.
