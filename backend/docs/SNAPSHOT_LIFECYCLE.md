# Snapshot Lifecycle (Phase B32)

A safe, reversible lifecycle for live snapshots so old data can eventually be
removed **without ever erasing evidence** used by alerts, outcomes, backtest,
replay or learning. Nothing is deleted by default.

## States
```
active → marked_for_deletion → soft_deleted → hard_deleted
   └──────────────► protected (never deletable)
                    deletion_blocked (terminal block)
```
- `active`: normal, visible. A doc with no `lifecycleState` is implicitly active.
- `protected`: any protection reason applies → never deletable.
- `marked_for_deletion`: flagged (reversible, still visible to retention).
- `soft_deleted`: hidden from default reads, recoverable (`restore`).
- `hard_deleted`: physically removed (Firebase doc deleted).

## Protection reasons (protect-first)
`linked_to_alert`, `linked_to_outcome`, `linked_to_backtest`, `linked_to_replay`,
`linked_to_learning`, `linked_to_promoted_alert`, `recent_snapshot`,
`important_event`, `score_change`, `status_change`, `evidence_snapshot`,
`manual_protection`, `unknown_dependency`.

When a dependency cannot be proven safe, the snapshot is protected
(`unknown_dependency`). Linkage is derived conservatively from the fixture
(has alerts?), the payload (timed events = evidence) and age — never invented.

## Flags (all default-safe)
```
ENABLE_SNAPSHOT_RETENTION=false
SNAPSHOT_RETENTION_DRY_RUN=true
ENABLE_SNAPSHOT_MARK_FOR_DELETION=false
ENABLE_SNAPSHOT_SOFT_DELETE=false
ENABLE_SNAPSHOT_HARD_DELETE=false
SNAPSHOT_RETENTION_SCAN_LIMIT=500
SNAPSHOT_RETENTION_BATCH_SIZE=100
SNAPSHOT_RETENTION_REQUIRE_MARK_BEFORE_DELETE=true
```

## Retention modes
| Mode | Effect | Requires |
|------|--------|----------|
| `dry_run` | plan only, no writes | (default) |
| `mark_only` | mark active+old candidates | `ENABLE_SNAPSHOT_MARK_FOR_DELETION` |
| `soft_delete` | soft-delete eligible candidates | `ENABLE_SNAPSHOT_SOFT_DELETE` |
| `hard_delete` | physically delete soft_deleted/marked + unprotected | `ENABLE_SNAPSHOT_HARD_DELETE` + admin |

`resolveRetentionMode` always downgrades toward `dry_run` when the matching flag is
off. `hard_delete` never acts on `active` directly when
`REQUIRE_MARK_BEFORE_DELETE=true`. The retention API route additionally requires
admin/owner for `hard_delete`.

## Repository methods (LiveSnapshotRepository)
`listLiveSnapshotsForRetention`, `getLiveSnapshotLifecycle`,
`updateLiveSnapshotLifecycle`, `markLiveSnapshotForDeletion`,
`softDeleteLiveSnapshot`, `restoreSoftDeletedLiveSnapshot`,
`hardDeleteLiveSnapshot`.
- **Firebase**: full lifecycle via doc fields (`lifecycleState`, `deletedAt`,
  `deletedBy`, `deletionReason`, `markedAt`, `retentionRunId`). Hard-delete only
  when `ENABLE_SNAPSHOT_HARD_DELETE=true` and the doc is soft_deleted/marked.
- **Prisma**: honest no-op (`supported: false`) — no lifecycle columns (schema
  unchanged; `db:generate` not run). Firebase is the primary persistence.

## Read-path safety
Default reads (`findLatestByFixture`, `findAfter`, `listRecent`) exclude
`soft_deleted` (and `hard_deleted` are physically gone). Backtest/replay/live
eval therefore never see soft-deleted data. Only `listLiveSnapshotsForRetention`
may include soft-deleted (admin/retention only). Docs without a lifecycle field
are treated as active — old data keeps working.

## Run audit
Every run persists a `SnapshotRetentionRun` (Firebase collection
`snapshotRetentionRuns`; Noop honest under Prisma) with requester, mode, and
results. No secrets stored.

## Limitations (real)
- No per-snapshot link to backtest/replay/learning in the schema → protection is
  conservative (a fixture with any alert protects its snapshots defensively).
- Scan bounded to `SNAPSHOT_RETENTION_SCAN_LIMIT`; large batches run incrementally
  (`SNAPSHOT_RETENTION_BATCH_SIZE`).
- Prisma mode cannot mutate lifecycle (no-op) — use Firebase for real lifecycle.

---

## B33 update — Evidence Lineage refines protection
The protection index now consults `evidenceSnapshotReferences` (B33) first: an
`exact` link (real snapshotId, from backtest/replay) or an inferred link yields
precise `linked_to_*` reasons; absence of a link falls back to protect-first
(recent / fixture-has-alert / `unknown_dependency`). This reduces over-protection
where exact links exist, without ever authorizing a delete on uncertainty. See
`EVIDENCE_LINEAGE.md`.
