# Alert Decision Precheck

`alertDecisionPrecheck.service.ts` consults the Match Intelligence Package before a
pattern would become an alert and emits an advisory decision. It is **observe-first**
and **never blocks a real alert** in this phase — it is not wired into the alert engine.

## Decisions

`allow_alert`, `block_alert`, `wait_for_lineup`, `wait_for_live_confirmation`,
`downgrade_to_monitor`, `post_match_only`.

## Gates

- `critical_data` — readiness has no missing critical data.
- `lineup_ready` — lineup not pending (temporal window).
- `live_confirmation` — if live, stats are present.
- `context_volatility` — context not extreme (knockout/decision).
- `history_base` — internal memory not insufficient.

## Decision logic (advisory)

post_match → `post_match_only`; pending lineup → `wait_for_lineup`; live without stats →
`wait_for_live_confirmation`; missing critical data → `block_alert`; extreme volatility
or insufficient history → `downgrade_to_monitor`; otherwise → `allow_alert` (the alert
engine's own final gates still apply).

## Modes & flags

| flag | default | effect |
|---|---|---|
| `ENABLE_ALERT_DECISION_PRECHECK` | `false` | enable the precheck at all |
| `ALERT_DECISION_PRECHECK_MODE` | `observe` | `observe` = report only; `enforce` = report enforcement intent |

Even in `enforce`, the result only **reports** `enforced: true` — it does not call into
or modify the alert engine, score, confidence, counters or results. Wiring enforcement
into the alert engine is a future, governed step.

## Pure core

`evaluatePrecheckFromPackage(pkg)` is a pure function (no I/O) and is covered by
`smokeMatchIntelligenceFabric.mjs` with synthetic packages.
