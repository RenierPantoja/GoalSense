# Local Live Operations + Data Pipeline Guardrails (Phase B30)

Lets you run GoalSense locally with safety: controlled workers, throttled live collection, snapshot
dedup, provider budgets, coverage/quality visibility, and volume-risk awareness. No engine behavior
change; no Telegram/odds/auto-bet; auto-create stays off.

## Runtime profile
`LOCAL_RUNTIME_PROFILE ∈ safe_local (default) | live_validation | intensive_debug | disabled`.
The profile only **recommends** flag states — explicit env flags always win (precedence). The panel
surfaces any dangerous flag that is ON against the profile's recommendation (`flagMismatches`).
- `safe_local`: workers off, limited reads/snapshots, auto-engine read-only, no auto-create/export.
- `live_validation`: limited live collection (max fixtures, throttled snapshots), workers with limits.
- `intensive_debug`: manual only, verbose; **never** default.
- `disabled`: no workers.

## Guardrails (env)
`ENABLE_LOCAL_OPERATIONS_PANEL=true`, `LOCAL_MAX_LIVE_FIXTURES`,
`LOCAL_MAX_SNAPSHOTS_PER_FIXTURE_PER_MATCH`, `LOCAL_MIN_SNAPSHOT_INTERVAL_SECONDS`,
`LOCAL_MAX_PROVIDER_CALLS_PER_MINUTE`, `LOCAL_MAX_PROVIDER_CALLS_PER_HOUR`,
`LOCAL_WRITE_BUDGET_PER_HOUR`, `LOCAL_READ_BUDGET_PER_HOUR`.

## Provider usage guard
`providerUsageGuard.recordProviderCall(provider, operation)` counts calls per minute/hour by
operation (`manual | live_worker | backtest | replay | auto_engine | other`) and blocks over budget
(returns `{allowed,reason}`). In-memory per process. `resetProviderUsageCounters()` clears counters
only (no data deleted). Callers decide what to do when blocked — the backend never crashes.

## Snapshot write guard
`snapshotWriteGuard.evaluateSnapshot(fixtureId, state)` decides whether a new snapshot is worth
writing: skips identical states (`no_relevant_change`), respects the min interval for stats/minute
changes (a score/status change always passes), and caps per match. **A skipped snapshot is never a
failure.** Relevance = score/status/events/stats change or a 5-minute window advance — enough for
replay/backtest while avoiding write explosion. Pure core: `decideSnapshotWrite`, `isRelevantChange`,
`snapshotHash` (smoke-tested).

## Data coverage monitor
`GET /api/system/local-operations/coverage` reports live fixtures, with/without snapshot, quality
(rich/partial/poor/**unknown**), stale snapshots, and low-coverage leagues. `unknown`/missing is
explicit and never a failure. Empty/honest when nothing is live.

## Worker registry
`workerRegistry` lists workers (env-enabled, running, paused, pausable, last error safe message,
writes, dangerous, recommended local state) and can pause/resume at runtime (pause = stop interval;
resume only if env allows). Runtime pause does NOT change the env. Schedulers without a stop function
report `pausable:false` (control via env).

## Volume / risk estimate
`estimateVolume` projects provider-calls/writes/reads per hour/day and a `riskLevel`
(low/moderate/high/unsafe) vs the local budgets. Operational estimate only — no monetary price.

## API (env-gated by `ENABLE_LOCAL_OPERATIONS_PANEL`)
`GET …/status | /provider-usage | /snapshot-guard | /coverage | /workers`;
`POST …/workers/:name/pause | /resume | /guards/reset-counters` (require `run:scan` → operator+; in
local mode owner). No secrets exposed; reset clears in-memory counters only.

## Operational warnings (non-Telegram)
The status surfaces: provider budget near limit, auto-create ON, auto-engine→alerts ON, Telegram ON,
export without auth, odds ON. These are local operational warnings — never Telegram, never betting.

## Scripts
- `npm run local:safe` (`scripts/runLocalSafeMode.mjs`) — pre-flight: prints main flags (no secrets),
  warns on dangerous/cost flags, recommends safe profile; `-- --start` to start after validation.
- `npm run local:diagnostics` — same report.
- `npm run smoke:local-ops` (`scripts/smokeLocalOperations.mjs`) — pure guardrail tests.

## When to migrate to cloud
Move to the B28/B29 cloud runtime when you need 24/7 collection beyond a single machine, shared
access, or want workers running unattended. Until then, run `safe_local` and enable
`live_validation` only while watching the panel.

## Limitations (honest)
- Counters are in-memory per process (reset on restart; not shared across instances).
- The snapshot/provider guards are available services; wiring them into the live worker's write path
  is documented but the worker integration is intentionally minimal to avoid destabilizing B12–B29
  (the guards are fully usable/observable now).
- Coverage reads are best-effort and depend on the persistence provider being reachable.

---

## B31 — Live Pipeline Guard Integration + Snapshot Retention

The B30 guards are now wired into the **real** pipeline (observe-first, default-safe):
- Provider budget consulted before the scoreboard (`live_fixtures`) and per-fixture
  summary (`fixture_detail`) calls. Budget block ≠ failure (`budget_blocked`).
- Snapshot write throttle/dedup/per-match cap on the single write site
  (`captureLiveSnapshot`). Skipped snapshot ≠ failure; score/status/event always pass.
- Local live-fixture cap (`LOCAL_MAX_LIVE_FIXTURES`) on `processLiveFixtures`
  (`ENABLE_LIVE_FIXTURE_CAP=true` by default).
- Guard metrics + snapshot retention plan endpoints under
  `/api/system/local-operations`. See `LIVE_PIPELINE_GUARD_INTEGRATION.md` and
  `SNAPSHOT_RETENTION.md`.

Precedence: `LOCAL_OPS_GUARD_MODE` (observe|enforce) always wins; the profile only
recommends. Counters are in-memory (reset on restart). Retention is dry-run only
(append-only repos, no delete backend).
