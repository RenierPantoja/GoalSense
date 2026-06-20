# Backtest/Replay Inline Snapshot Evidence (Phase B35)

Closes the B34 gap: the persisted `BacktestSignalResult` and the `ReplayStep`
(decision point) now carry the **exact** `snapshotId` they used, so the UI shows
per-row / per-step evidence without a separate Evidence Lineage lookup. Evidence
Lineage remains the central index; the inline fields are a convenience copy.

## New fields (all optional, compatible with old runs)
`BacktestSignalResult`:
`triggerSnapshotId`, `triggerSnapshotCapturedAt`, `triggerSnapshotMinute`,
`triggerEvidenceStrength`, `triggerEvidenceLimitations`, `outcomeSnapshotId`,
`outcomeSnapshotCapturedAt`, `outcomeSnapshotMinute`, `outcomeEvidenceStrength`,
`outcomeEvidenceLimitations`, `evidenceSummary`.

`ReplayDecisionPoint` (step):
`snapshotId`, `snapshotCapturedAt`, `snapshotMinute`, `evidenceStrength`,
`evidenceLimitations`.

`BacktestSummary.evidenceCoverage` (`BacktestEvidenceCoverage`):
`totalResults`, `resultsWithExactTriggerSnapshot`, `resultsWithExactOutcomeSnapshot`,
`resultsWithAnyEvidence`, `exactEvidenceRate`, `inferredEvidenceRate`,
`missingEvidenceRate`, `commonLimitations`.

## How ids are derived
- **Trigger**: the snapshot at `ordered[triggerIndex]` — the exact snapshot the
  evaluator triggered on. `exact` when it has a real id.
- **Outcome**: the most-recent post-trigger snapshot used by the outcome estimator
  (`post[post.length-1]`). `exact` when it has a real id; `window_inferred` when
  post snapshots exist but no id; `unknown`/`no_post_trigger_snapshot` otherwise.
- **Replay step**: each ordered snapshot's id (the step IS that snapshot).
- `exact` requires a real `snapshotId`; nothing is invented. Missing ids carry a
  limitation (`trigger_snapshot_id_missing`, `outcome_snapshot_id_missing`,
  `no_post_trigger_snapshot`, `step_snapshot_id_missing`, `no_trigger`).

## Guarantees
- No change to trigger detection, outcome estimation, summary hit/fail/unknown
  counts, score, confidence, counters or patterns. Evidence coverage is a SEPARATE
  metric from hit-rate.
- A missing snapshot is NOT a failure; `unknown` ≠ `failed`.
- Evidence is fire-and-forget — failures never affect the run.
- Old runs (no inline fields) remain valid; coverage counts them as missing
  evidence (not failure).

## Persistence
Firebase persists the new fields automatically (full-object `set`). Fields are
always set to a value or `null` (never `undefined`). Noop/Prisma fallback unaffected.

## Backfill
`scripts/backfillBacktestReplayInlineEvidence.mjs` (dry-run default;
`--persist` + `ENABLE_BACKTEST_REPLAY_INLINE_EVIDENCE_BACKFILL=true`) recomputes
each run's `summary.evidenceCoverage` from its persisted result fields — never
invents ids. Old runs without inline fields should be **re-run** for exact inline
evidence (historical evidence links were generic per-snapshot, not trigger/outcome
specific). Replay per-step ids are captured at run time; old replays are not
rewritten blindly.

## Limitations (real)
- Outcome snapshot = most-recent in-window snapshot (a real id, not necessarily the
  precise outcome minute).
- Backfill cannot reconstruct trigger/outcome-specific ids for pre-B35 runs (re-run
  to populate); it only refreshes the coverage summary from existing inline fields.
- Prisma mode: backtest run/result persistence exists, but the intelligence
  evidence index is Noop — inline fields still persist on the result docs in
  Firebase mode.
