# Backtest/Replay Evidence Reprocessing — Audit (Phase B36)

> How to safely recover inline snapshot evidence for OLD runs by RE-evaluating
> against the same persisted snapshots, applying a patch ONLY when the reprocessed
> result matches the original. Never changes the result, score, confidence, pattern
> or outcome.

## 1. Deterministic re-evaluation is possible
- `evaluateFixture(patternView, fixtureView, snapshots, mode, coverage)` is already
  **exported** and pure-ish: it reads ordered snapshots and runs the SAME evaluator
  the live worker uses. Given the same persisted snapshots, it reproduces the same
  trigger/outcome — and now (B35) also the snapshot ids.
- Persisted `BacktestSignalResult` carries `fixtureId` + `id`
  (`backtestSignalResultId(runId, fixtureId)`), so each original result maps 1:1 to
  a fixture to re-evaluate. No scope re-resolution needed.

## 2. What old runs have vs need
- Old run results have: `fixtureId`, `minute` (trigger), `estimatedOutcome`,
  `wouldTrigger`, `dataQuality`. They LACK `triggerSnapshotId`/`outcomeSnapshotId`
  and identities.
- Re-evaluation yields the derived result WITH ids + identities.

## 3. How to compare original vs derived (patch gate)
A patch is allowed ONLY when ALL hold:
- `fixtureId` equal; `patternId` (run-level) equal;
- `wouldTrigger` equal; `estimatedOutcome` equal (resultStatus);
- trigger `minute` equal OR within `toleranceMinutes` (explicit, default 0);
- derived has a REAL `triggerSnapshotId` (else nothing exact to recover).
Any mismatch → no patch, recorded as `dry_run_mismatch`. This is a `BacktestResultFingerprint`
comparison (operational, not cryptographic).

## 4. Where to persist a patch
- Backtest result docs are separate (`backtestSignalResults/{id}`). Add a repo
  `updateBacktestSignalResult(id, patch)` (Firebase `set merge`; Noop count 0;
  Prisma noop). Patch sets only the evidence fields + identities + reprocess status.
- Replay timeline is embedded in the replay run doc. Re-running `replayFixture`
  already produces per-step `snapshotId` (B35) + `stepIdentity` (B36); patch mode
  persists via `createReplayRun` (set merge) — no new method.

## 5. Audit
- New `backtestReplayEvidenceReprocessRuns` collection (Firebase) + Noop. Records
  scanned/matched/patched/mismatched/skipped/recovered + limitations + status.

## 6. Replay re-run safety
- `replayFixture` walks the same snapshots and is deterministic; re-running does not
  fabricate a new timeline (same snapshots → same points). Patch only updates the
  inline snapshot fields; the decision points themselves are reproduced identically.

## 7. Evidence lineage
- When a patch is applied, create an `exact` `EvidenceSnapshotReference` (idempotent,
  non-fatal). Existing inferred links are kept (superseded-by-exact is implicit via
  strength ranking in bundles).

## 8. Guarantees
- dry-run default; patch requires `ENABLE_BACKTEST_REPLAY_EVIDENCE_REPROCESS_PATCH=true`
  + admin/operator; mismatch blocks patch; never invents a snapshotId; never
  recalculates learning/counters; old runs without identities stay valid (legacy).

## 9. Files touched
backtest.types.ts, backtestEvidenceIdentity.util.ts (new), backtestEngine.service.ts,
backtestOutcome.service.ts, replayEngine.service.ts,
backtestReplayEvidenceReprocessor.service.ts (new), evidenceLineage.service.ts,
repositories (contract+firebase+noop), backtest routes, env.ts,
scripts/reprocessBacktestReplayEvidence.mjs (new), scripts/smokeBacktestReplayEvidenceReprocessing.mjs (new),
frontend backtestTypes/backtestApi + BacktestEvidenceReprocessPanel + table/replay/coverage, docs.
