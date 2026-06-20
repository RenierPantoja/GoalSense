# Snapshot Lifecycle — Audit (Phase B32)

> Map of where live snapshots are written, read, and depended-upon, so a safe
> lifecycle (mark → soft-delete → hard-delete) can be added without ever erasing
> evidence used by alerts, outcomes, backtest, replay or learning.

## 1. Where snapshots are written
- Single write site: `liveMonitor.service.ts → captureLiveSnapshot()` →
  `repos.liveSnapshots.create()`. Guarded by B31 `guardSnapshotWrite`.
- Firestore collection: **`liveSnapshots`** (auto id). Fields: `id`, `fixtureId`,
  `capturedAt` (ISO), `createdAt` (ISO), `minute`, `status`, `scoreHome`,
  `scoreAway`, `penaltyHome/Away`, `dataQuality`, `provider`, `statsJson`,
  `eventsJson`. **No lifecycle fields today** (every doc is implicitly active).

## 2. Identity fields
- `fixtureId` links a snapshot to a fixture; `provider` + `capturedAt` order the
  history. There is **no `matchId`** and **no per-snapshot link** from alerts/
  outcomes/backtest/replay/learning back to a `snapshotId`.

## 3. Who reads snapshots (read-path surface)
| Caller | Method | Purpose |
|--------|--------|---------|
| `commandEvaluation.service.ts` | `findLatestByFixture` | live pattern eval |
| `autoEngine.service.ts` | `findLatestByFixture` | opportunity scan |
| `radarDiagnostic.service.ts` | `findLatestByFixture` | diagnostics |
| `autoOpportunityActions.service.ts` | `findLatestByFixture` | evidence/age |
| `alertResolution.service.ts` | `findAfter` | resolution evidence |
| `backtestEngine.service.ts` | `listRecent({fixtureId})` | **backtest reads** |
| `replayEngine.service.ts` | `listRecent({fixtureId})` | **replay reads** |
| `liveMonitor.routes.ts` | `listRecent({fixtureId})` | UI history |
| `dataCoverageMonitor.service.ts` | `findLatestByFixture` | coverage |
| `snapshotRetention.service.ts` | `listRecent` | retention plan |

**Conclusion**: all reads funnel through three repo methods
(`findLatestByFixture`, `findAfter`, `listRecent`). Filtering soft/hard-deleted at
those three choke points makes every caller safe without edits.

## 4. Importance metadata
- None today. Importance must be **derived** (protect-first): recent age, fixture
  has an alert, snapshot carries timed events (`eventsJson`), or dependency is
  unresolvable (`unknown_dependency`).

## 5. Delete capability today
- `LiveSnapshotRepository` has no delete. Firebase docs can be deleted via the
  Admin SDK; Prisma has `liveSnapshot` but **no lifecycle columns** (changing the
  schema is out of scope — `db:generate` not run). → Prisma lifecycle methods are
  **honest no-ops** (not-supported), Firebase implements the full lifecycle.

## 6. Safe soft-delete approach
- Add lifecycle fields to the Firestore doc (no document removal on soft-delete):
  `lifecycleState`, `deletedAt`, `deletedBy`, `deletionReason`, `retentionRunId`,
  `markedAt`. Reads exclude `soft_deleted` by default (and `hard_deleted` are
  physically gone). Docs without `lifecycleState` are treated as **active**.
- Soft-delete is reversible (`restoreSoftDeletedLiveSnapshot`). Hard-delete only on
  `soft_deleted`/`marked_for_deletion`, unprotected, with `ENABLE_SNAPSHOT_HARD_DELETE=true`.

## 7. Read-path filter rule
- Default reads: `lifecycleState ∉ {soft_deleted, hard_deleted}` (hard never present).
- Admin/debug may opt-in to include soft-deleted (`includeSoftDeleted`), used only
  by retention listing — never by backtest/replay/live eval.

## 8. Run audit + metrics persistence
- `SnapshotRetentionRun` and `LocalOpsMetricsSnapshot` persist via the
  IntelligenceRepository (Firebase collections `snapshotRetentionRuns` /
  `localOpsMetrics`; Noop honest under Prisma mode). No secrets stored.

## 9. Files touched by B32
contracts.ts, firebaseLiveSnapshot.repository.ts, prismaRepositories.ts,
firebaseIntelligence.repository.ts, noopIntelligence.repository.ts,
localops/snapshotLifecycle.types.ts (new), localops/snapshotProtectionIndex.service.ts (new),
localops/snapshotRetention.service.ts (V2), localops/localOpsMetricsPersistence.service.ts (new),
localops/utils/localOps.util.ts (pure helpers), localOperations.routes.ts,
localOperations.service.ts, frontend types/api/panel, scripts/smokeSnapshotLifecycle.mjs (new).
