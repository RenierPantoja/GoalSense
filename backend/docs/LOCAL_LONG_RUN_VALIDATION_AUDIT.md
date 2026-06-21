# Local Long-Run Validation — Reality Map (B49 / Bloco 6)

Audit of what can run locally, its cost and its risks BEFORE building the long-run runner.
Rule: manual-first, scheduler off, never block alerts, never enforce, never invent data.

## Modules that already run locally
- ESPN live monitor (env-gated worker), pattern worker, resolution worker (flag-gated).
- Pre-match acquisition (B40/B44), critical-domain acquisition (B44) — manual/flag.
- Match Intelligence Package V1–V5, Readiness V1–V7, Precheck V1–V7 (on-demand).
- Historical memory (B45), variable influence (B46), governance (B47), causal (B48) — manual.

## Manual modules (scheduler OFF by default)
- Pre-match acquisition scheduler, historical memory scheduler, causal scheduler,
  governance live-recheck (on-demand), auto-engine scheduler.

## High-cost modules / risks
- Provider calls (API-Football) — env-gated; guarded by ProviderUsageGuard.
- Firebase reads/writes — every package/memory/influence/governance build reads ledger/
  outcomes/snapshots. The causal runner rebuilds packages per alert (NO cache) → main cost.
- Snapshot writes — guarded by SnapshotWriteGuard + local caps.
- Loop risk: live re-evaluation if wired to the monitor without rate-limit.

## Firebase-dependent / Noop-empty
- All intelligence memory (ledger/outcomes/learning), governance results/holds/runs,
  causal cases/insights/suggestions, validation runs/metrics. Under Prisma/Noop these read
  empty (honest), so validation reports `insufficient_data` rather than false zeros.

## Metrics that already exist
- LocalOps metrics (B32), provider health, live validation sessions (B37), session
  attribution (B38), evidence lineage (B33).

## Metrics that are missing (built here)
- Consolidated per-run reliability (governance aligned/strict/loose, causal evaluable vs
  not_evaluable), coverage by domain/mapping/lineup/injury/etc., cost (provider calls,
  Firestore reads/writes estimated, cache hits), readiness distribution, go/no-go.

## What a daily validation should run (per fixture)
scope → identity/domain unlock → critical acquisition → package V5 → memory → influence →
governance (shadow) → holds → live check (if live) → post-match resolution (if finished) →
causal (if outcome) → summary. All non-fatal per fixture.

## What must NOT auto-run
Enforce, Telegram, auto-bet, odds, calibration application, scheduler. Live-recheck bridge
is OFF by default and rate-limited when enabled.

## Cache needs
Package V5 / Readiness V7 / Precheck V7 / InfluenceAggregate / DomainUnlockMatrix / memory /
governance result per run, invalidated on domain refresh / lineup change / manual record /
live trigger / mapping change. Cache is per-process, never a source of truth.

## Realistic ready / not-ready criteria
- Local backend `go` only if build+smokes pass, env valid, no critical loop/cost.
- Commercial readiness CANNOT be `beta_candidate` without: provider configured + mapping
  coverage + a real long validation history + Firebase configured. Otherwise `internal_alpha`
  / `not_ready`. A metric is never a promise of future accuracy.

## Conclusion
Build a plan engine (safe selection within local caps), a non-fatal runner, a metrics
collector that separates failure from limitation/not_evaluable, a per-run cache, a safe
flag-gated live-recheck bridge, a link-repair (never weak→exact), coverage + final health/
go-no-go reports — all observe/shadow, Firebase-persisted, Noop-honest.
