# Local Operations — Pipeline Guards UI (Phase B31)

The `LocalOperationsPanel` (Auto Engine cockpit → "Operação Local") gains B31
sections on top of the B30 profile/coverage/workers views.

## New sections
- **Guard do pipeline ao vivo** — guard mode (observe/enforce) + recommended mode,
  which guards are enabled (provider / snapshot / cap), and a `recommendedAction`
  hint when the mode diverges from the profile. Metric columns:
  - Provider: calls allowed / blocked + last block time.
  - Snapshot: written / skipped duplicate / no-relevant-change / interval / max-per-fixture.
  - Fixture cap: observed / skipped by cap / snapshots protected for replay.
- **Retenção de snapshots (dry-run)** — enabled/disabled + dry-run badges,
  thresholds, scanned / candidates / protected / wouldDelete, oldest candidate age.
  Admins get an "Executar plano (dry-run)" button with a strong confirm. Real
  delete is never possible from the UI (no delete backend) — the confirm text says so.

## Warnings (in the existing "Avisos operacionais" card)
Sourced from the backend status: `guard_observe_only`, `guard_off`,
`guard_recommendation`, `retention_real_mode`, plus the B30 advisories
(provider near limit, auto-create on, telegram on, odds on, unsafe profile).

## Safety in the UI
- No secrets, tokens, or payloads are shown.
- Reset counters and pause/resume are runtime-only (never mutate env).
- Real deletion requires both backend permission and a strong confirm — and even
  then the backend reports `deleted: 0` because no delete backend exists.
- All read endpoints degrade honestly (null/empty) when disabled or unavailable.

## API
`src/services/localOperationsApi.ts`: `getGuardMetrics()`,
`getSnapshotRetentionPlan()`, `runSnapshotRetention()` (plus the B30 methods).
Types in `src/features/command/intelligence/localOperationsTypes.ts`
(`GuardMetricsDto`, `SnapshotRetentionPlanDto`, `SnapshotRetentionRunResultDto`).
