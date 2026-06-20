# Memory-Aware Precheck & Readiness (B45 / Bloco 2)

Adds the historical-memory layer to readiness and the observe-first precheck.

## Readiness V6 — `buildFundamentalReadinessV6(fixtureId)`
(appended to `fundamentalReadinessEngine.service.ts`)

States:
- `ready_with_memory_support` — strong memory + supportive contexts.
- `ready_but_memory_weak` — memory reliability low/insufficient.
- `insufficient_memory` — both clubs `insufficient_history`.
- `memory_contradicts_pattern` — a `stay_out` context exists.
- `memory_requires_live_confirmation` — usable but needs live.
- `stay_out_memory_misleading` — a `misleading_risk` context exists.

`memoryReadinessScore` measures **data-confidence of memory, not a win probability**.

## Precheck V6 — `runAlertDecisionPrecheckV6(fixtureId)`
(appended to `alertDecisionPrecheck.service.ts`)

- Observe-first; flag-gated by `ENABLE_ALERT_DECISION_PRECHECK` /
  `ALERT_DECISION_PRECHECK_MODE` (shared with V1–V5).
- Emits memory reasons: `team_memory_positive`, `memory_contradicts_pattern`,
  `stay_out_memory_misleading`, `memory_insufficient_history`,
  `matchup_memory_supported` / `matchup_memory_insufficient`.
- Decisions: alert_candidate / monitor / wait_for_* / post_match_learning_only.
- Memory **never hard-blocks**: even in enforce mode only `wait_*` is enforceable
  intent; it is not wired into the alert engine.

## Decision Input Ledger
`buildDecisionInputs` accepts optional memory sources and emits advisory inputs
(`fundamental_memory_*`, `matchup_memory`, `pattern_context_*`, `taboo_*`,
`stay_out_memory_reason`, `sample_quality_warning`) — qualitative only, no math weight.
