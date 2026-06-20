# Evidence Lineage Backfill (Phase B33)

Conservatively backfills evidence links for history that predates B33, so old
alerts/outcomes gain a lineage trail. **Dry-run by default. Never deletes. Never
invents a snapshotId (so never creates `exact` links).**

## Run
```
node scripts/backfillEvidenceLineage.mjs                # dry-run (no writes)
node scripts/backfillEvidenceLineage.mjs --persist      # writes — requires env flag
node scripts/backfillEvidenceLineage.mjs --limit 200 --fixture <id>
node scripts/backfillEvidenceLineage.mjs --from 2026-01-01 --to 2026-02-01
```
Persisting requires BOTH `--persist` AND `ENABLE_EVIDENCE_LINEAGE_BACKFILL=true`.

## What it does
- Reads `listAllSignalLedgerEntries` and `listAllAlertOutcomes`.
- Creates `window_inferred` links (`trigger_state` / `outcome_state`) by
  fixture + minute. `createdBy: 'backfill'`.
- Reports `{ mode, exactCreated, inferredCreated, unknown, skipped, persistedCreated, limitations }`.

## Guarantees
- `exactCreated` is always 0 (no snapshotId in historical sources).
- No source row is modified or deleted.
- Idempotent (deterministic link ids) — safe to re-run.

## Route alternative
`POST /api/intelligence/evidence-lineage/backfill` (env-gated + admin/owner) returns
a pointer to this script; the heavy job intentionally runs from the CLI.

## Limitations
- Inferred-only by nature; precision improves going forward as backtest/replay
  produce exact links.
- Under Prisma mode nothing is persisted (Noop).
