# Snapshot Retention (Phase B31)

A **safe, dry-run** foundation for cleaning up old live snapshots. It builds a
*plan* (classify + count) but does **not** delete: the `LiveSnapshotRepository`
(Firebase / Prisma / Noop) is append-only, with no delete method. This is the
honest "path exists, zero risk" approach. When in doubt, a snapshot is protected.

## Flags
```
ENABLE_SNAPSHOT_RETENTION=false        # master switch (off by default)
SNAPSHOT_RETENTION_DAYS_RAW=7          # raw, unlinked snapshots older than this → delete candidate
SNAPSHOT_RETENTION_DAYS_IMPORTANT=30   # reserved threshold for linked records (currently always protected)
SNAPSHOT_RETENTION_DRY_RUN=true        # never actually delete
```

## Classification (`classifySnapshotRetention`, pure)
| Category | Protected? | Delete candidate? |
|----------|-----------|-------------------|
| `promoted_alert_related` | yes | no |
| `important_for_alert` (alert/outcome) | yes | no |
| `important_for_backtest` | yes | no |
| `important_for_replay` | yes | no |
| `learning_related` | yes | no |
| `raw` within window | no | no |
| `raw` older than `RAW` days | no | **yes (candidate)** |

Precedence: promoted-alert > alert/outcome > backtest > replay > learning > raw.
Any linkage protects the record regardless of age.

## Endpoints
- `GET  /api/system/local-operations/snapshot-retention/plan` — read-only plan
  (`scanned`, `byCategory`, `candidates`, `protectedRecords`, `wouldDelete`,
  `oldestCandidateAgeDays`, `thresholds`, `limitations`).
- `POST /api/system/local-operations/snapshot-retention/run` — operator+ (`run:scan`),
  env-gated. Always returns `deleted: 0` (no delete backend), with explicit
  `limitations` explaining why. Audited via the admin audit trail.

## Linkage resolution (current)
- Alert linkage is resolved per fixture via `alerts.findByFixtureIds` (cached).
- Backtest/replay/learning linkage is **not** resolvable per snapshot in the
  current schema → such records are protected conservatively when the fixture has
  any alert; on any read error the record is protected.

## Limitations (real)
- **No real deletion**: append-only repos; `deleted` is always 0. A future safe
  delete method (Firebase + Prisma + Noop) is required to enact the plan.
- Scan is bounded to the 500 most-recent snapshots (partial coverage).
- Per-snapshot backtest/replay/learning linkage is approximated (protect-first).
- Counters/plan reflect a point-in-time read; nothing is cached destructively.
