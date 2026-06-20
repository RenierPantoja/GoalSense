# Live Alert Evidence Capture (Phase B34)

Captures the **exact** `snapshotId` that was evaluated at the moment an alert is
triggered, an outcome is resolved, an opportunity is generated, or a policy is
evaluated — turning B33's inferred links into exact ones, without touching score,
confidence, counters, patterns or any decision.

## What is captured (all optional, non-breaking, non-fatal)
| Flow | Field added | Source of the id |
|------|-------------|------------------|
| Alert trigger | `SignalLedgerEntry.triggerSnapshotId` | the snapshot `commandEvaluation` evaluated (`findLatestByFixture`) |
| Alert outcome | `AlertOutcomeRecord.outcomeSnapshotId` | the most recent snapshot in the resolution window (`findAfter`) |
| Auto opportunity | `AutoOpportunity.evidenceSnapshotId` | the snapshot the scan evaluated (`findLatestByFixture`) |
| Policy evaluation | `AutoAlertPolicyEvaluation.policyEvidenceSnapshotId` | inherited from the opportunity |
| Promotion (B22/B23) | promotion evidence link | inherited from the opportunity |

Each also stores `*CapturedAt` where available, and a `triggerEvidenceStrength`.

## Evidence links (via `evidenceLineage.service.ts` helpers)
- `linkTriggerSnapshot`, `linkOutcomeSnapshot`, `linkOpportunitySnapshot`,
  `linkPolicySnapshot`, `linkPromotionSnapshot`.
- Strength is **exact** when a real `snapshotId` is present, else `window_inferred`.
  When absent, the link records the limitation `snapshot_not_written`.
- All creation is fire-and-forget (`void`), wrapped, and never blocks the alert /
  outcome / opportunity / policy. Gated by `ENABLE_EVIDENCE_LINEAGE`.

## Honesty guarantees
- Exact only with a real id (`buildReference`/`normalizeLinkStrength` downgrade an
  `exact` request without an id to `strong_inferred`).
- `unknown` never authorizes a delete (retention protect-first preserved).
- No change to `evaluatePatternAgainstInput`, scoring, confidence band, risk gate,
  outcome mapping (`unknown` ≠ `failed`), counters, or patterns.
- Skipped snapshots (B31 guard) are not a failure; the evaluator still reads the
  previous snapshot (which has an id), so triggers can still be exact.

## limitation: `snapshot_not_written`
When the live guard skipped a write and there is genuinely no snapshot for the
fixture, the link carries `snapshot_not_written` and stays inferred/unknown.

## Backfill
`scripts/backfillEvidenceLineage.mjs` now emits **exact** links from stored
`triggerSnapshotId`/`outcomeSnapshotId` (B34) and `window_inferred` otherwise.
Report fields: `exactFromStoredSnapshotId`, `inferredWindow`, `unknown`, `skipped`.

## UI
Alert drawer (Evidência & Linhagem) and the opportunity drawer (Evidência da
oportunidade) surface exact vs inferred; the replay viewer shows a fixture lineage
summary. See `docs/INLINE_EVIDENCE_UX.md`.

## Limitations (real)
- Outcome exact link uses the most-recent in-window snapshot, not necessarily the
  precise minute the outcome occurred (honest approximation; still a real id).
- Backtest results table does not render per-row trigger/outcome snapshot ids — the
  persisted `BacktestSignalResult` has no snapshot-id field (the engine links the
  evaluated snapshots at run level instead).
- Prisma mode does not persist links/fields beyond the alert/opportunity docs (Noop
  for evidence). Use Firebase mode for full lineage.
