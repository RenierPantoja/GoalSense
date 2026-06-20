# Backtest/Replay Evidence Reprocessing + Trigger Identity (Phase B36)

Adds a persistent **trigger/outcome/step identity** and a conservative
**reprocessor** that recovers inline snapshot evidence for OLD runs by
re-evaluating against the same persisted snapshots — applying a patch ONLY when
the reprocessed result matches the original. Never changes a result, outcome,
score, confidence, counters or patterns.

## Identity (new, optional, compatible with old runs)
- `BacktestTriggerIdentity`: patternId/name, signalType, conditionKey + fingerprint,
  triggerMinute, fixture/competition/team context, `evaluatedAtSnapshotId`,
  `evaluationFingerprint`, limitations.
- `BacktestOutcomeIdentity`: outcomeType, window start/end, `outcomeSnapshotId`,
  `outcomeFingerprint`, limitations.
- `BacktestResultFingerprint`: fixture/pattern/triggerMinute/triggerSnapshotId/
  outcomeStatus/outcomeSnapshotId/resultStatus/notEvaluableReason/evaluationVersion
  + `hash` (operational, not cryptographic).
- `ReplayStepIdentity`: stepIndex, fixture, minute, status, score/event fingerprints,
  snapshotId, fingerprint, limitations.
New runs persist these; old runs without them stay valid (`legacy`).

## Reprocessing (`backtestReplayEvidenceReprocessor.service.ts`)
- `reprocessBacktestRunEvidence(runId, { mode, toleranceMinutes })`: loads the run +
  its persisted results, re-evaluates each fixture with `evaluateFixture` (same pure
  evaluator + same persisted snapshots), and compares.
- `reprocessReplayRunEvidence(runId, { mode })`: re-runs `replayFixture`
  deterministically (same snapshots → same steps + per-step ids).
- Modes: `dry_run` (default, no writes) and `patch_inline` (requires
  `ENABLE_BACKTEST_REPLAY_EVIDENCE_REPROCESS_PATCH=true` + operator+).

## Patch gate (`compareBacktestResult`)
A patch is applied ONLY when ALL hold: same `fixtureId`, same `patternId`, same
`wouldTrigger`, same `estimatedOutcome`, trigger `minute` within `toleranceMinutes`,
AND a REAL `triggerSnapshotId` was derived. Any mismatch → no patch
(`dry_run_mismatch`). The patch (`buildEvidencePatch`) carries ONLY evidence fields
+ identities + reprocess status — never the outcome/result/score.

## Audit
Every run records a `BacktestReplayEvidenceReprocessRun`
(Firebase `backtestReplayEvidenceReprocessRuns`; Noop honest) with
scanned/matched/patched/mismatched/skipped/exactRecovered + limitations + status.

## Evidence lineage
On an applied patch, a non-fatal **exact** `EvidenceSnapshotReference`
(`backtest_result`) is created; existing inferred links are kept (exact wins in
bundles by strength ranking).

## Repository
`updateBacktestSignalResult(id, patch)` (Firebase set-merge; Noop count 0; Prisma
noop). Reprocess-run CRUD on the IntelligenceRepository.

## Routes
`GET /api/intelligence/backtest-replay-evidence/reprocess-runs[/:id]`,
`POST /api/intelligence/backtest-runs/:runId/reprocess-evidence`,
`POST /api/intelligence/replay-runs/:runId/reprocess-evidence` (patch_inline needs
operator+ and the env flag; backtest API must be enabled).

## Script
`scripts/reprocessBacktestReplayEvidence.mjs --runId <id> --type backtest|replay|both`
(dry-run default; `--persist` + env flag for patch; `--tolerance-minutes`).

## Guarantees
dry-run default · patch needs flag + operator+ · mismatch blocks patch · never
invents a snapshotId · resultStatus/outcome/score/confidence/counters/patterns
unchanged · old runs compatible · non-fatal.

## Limitations (real)
- A patch is only possible when re-evaluation reproduces the original result; if the
  underlying snapshots changed or were retained/deleted, it records a mismatch
  (no patch) — honest.
- Replay reprocessing patches per-step ids only via a full deterministic re-run; old
  replays with missing snapshot ids stay legacy.
- Prisma mode does not persist identities/patches (Noop for the evidence index);
  Firebase mode is the persistence path.
