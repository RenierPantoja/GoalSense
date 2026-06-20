# Live Pipeline Guard Integration (Phase B31)

Wires the B30 guards (provider budget, snapshot write, live-fixture cap) into the
**real** live pipeline — controlled, gradual, observe-first. Nothing is enforced
until an operator opts in. A blocked provider call is **not** a failure; a skipped
snapshot is **not** a failure. Backtest/replay/learning honesty is preserved.

## observe vs enforce

| Mode | Provider budget | Snapshot guard | Fixture cap |
|------|-----------------|----------------|-------------|
| `observe` (default) | over-budget intents counted; **call proceeds** | would-skips counted; **snapshot written** | would-skips counted; **all fixtures processed** |
| `enforce` | over-budget call **blocked** (`blockedByProviderBudget`) | duplicate/interval/cap snapshots **skipped** | fixtures beyond cap **dropped** (`fixture_cap_exceeded`) |

**Precedence**: the explicit `LOCAL_OPS_GUARD_MODE` env always wins. `LOCAL_RUNTIME_PROFILE`
only provides a *recommended* mode (`safe_local`→observe, `live_validation`→enforce,
`intensive_debug`→observe). The panel surfaces a `recommendedAction` when the
effective mode differs from the profile recommendation.

## Flags (all default-safe)

```
LOCAL_OPS_GUARD_MODE=observe          # observe | enforce
ENABLE_PROVIDER_USAGE_GUARD=false     # enforce provider budget (only matters in enforce mode)
ENABLE_SNAPSHOT_WRITE_GUARD=false     # enforce snapshot throttle/dedup/cap
ENABLE_LIVE_FIXTURE_CAP=true          # cap local live fixtures (cheapest/safest guard)
ENABLE_LOCAL_OPS_GUARD_LOGGING=true   # compact, rate-limited guard logs
ENABLE_SNAPSHOT_RETENTION=false       # see SNAPSHOT_RETENTION.md
SNAPSHOT_RETENTION_DRY_RUN=true
```

Recommended local presets:
- `safe_local` → `observe` (or conservative enforce: cap on, provider/snapshot observe).
- `live_validation` → `enforce` with `ENABLE_PROVIDER_USAGE_GUARD=true`, `ENABLE_SNAPSHOT_WRITE_GUARD=true`.
- `intensive_debug` → `observe` (richer logs, never drops data).

## Provider budget

`guardProviderCall(provider, operation)` consults the B30 `providerUsageGuard`
before each external call. Integrated at:
- **Scoreboard** (`liveMonitor.worker.ts`) — operation `live_fixtures`. Budget block
  skips the run (no `consecutiveErrors` increment) and reports `retryAfterEstimate`.
- **Per-fixture summary** (`liveMonitor.service.ts`) — operation `fixture_detail`.
  Budget block skips enrichment; the base snapshot still proceeds. Counted as
  `summariesSkippedByBudget` (distinct from `summariesFailed`).

When data is missing because of budget, availability is `budget_blocked` — never
`failed`.

## Snapshot write decision

`guardSnapshotWrite(fixtureId, state)` previews the B30 `decideSnapshotWrite` rule
(`commit=false`), then commits the **actual** decision so the tracker never drifts:
- Score/status/event change → always written.
- Duplicate / no-relevant-change → `no_relevant_change`.
- Stats-only change within `LOCAL_MIN_SNAPSHOT_INTERVAL_SECONDS` → `min_interval_not_elapsed`.
- Per-match count ≥ `LOCAL_MAX_SNAPSHOTS_PER_FIXTURE_PER_MATCH` → `max_per_match_reached`.
- `evidenceForAlert` → forced write (an opportunity/alert needs its evidence).

In observe mode a would-skip is **written anyway** and `commitWrite` updates the
tracker, so enabling enforce later behaves predictably.

## Fixture cap

`applyFixtureCap(fixtures)` caps to `LOCAL_MAX_LIVE_FIXTURES`, preserving order
(caller may pre-sort by priority). In observe mode nothing is dropped — the
would-skip count is still reported. The Auto Engine also respects the cap when its
fixture list flows through the same guard (`AUTO_ENGINE_MAX_FIXTURES_PER_RUN`
remains its own independent cap).

## Metrics (in-memory, per process)

`GET /api/system/local-operations/guard-metrics` →
`providerCallsAllowed/Blocked`, `fixturesObserved`, `fixturesSkippedByCap`,
`snapshotsWritten`, `snapshotsSkippedDuplicate/Interval/MaxPerFixture/NoRelevantChange`,
`snapshotsProtectedForReplay`, `retentionCandidates/Protected`,
`lastProviderBlockAt/SnapshotSkipAt/GuardBlockAt`, `guardMode`, `recommendedAction`.
Reset via `POST .../guards/reset-counters` (clears counters only; **never** deletes
persisted data). Counters reset on backend restart.

## Logging

Compact one-line logs (`[GuardB31] …`), rate-limited to one per distinct event key
per 30s, gated by `ENABLE_LOCAL_OPS_GUARD_LOGGING`. No payloads, no tokens, no
secrets.

## Trade-off: backtest / replay
Replay/backtest read **persisted** snapshots. Over-aggressive dedup/interval would
thin replay granularity, so the guard always keeps score/status/event changes and a
5-minute minute-window step. Retention protects any snapshot linked to an
alert/outcome/replay/backtest/learning record (see SNAPSHOT_RETENTION.md).

## Operating locally for days/weeks
1. Start in `observe` to watch what enforcement *would* do (panel metrics).
2. Keep `ENABLE_LIVE_FIXTURE_CAP=true` to bound local collection.
3. When comfortable, switch `LOCAL_OPS_GUARD_MODE=enforce` and enable the provider/
   snapshot guards for `live_validation`.
4. Use `reset-counters` between sessions; remember counters are in-memory.
