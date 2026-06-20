# Live Alert Evidence Capture — Audit (Phase B34)

> Where a real `snapshotId` is available at evaluation time, so triggers/outcomes/
> opportunities/policies can carry an **exact** snapshot reference WITHOUT touching
> score, confidence, counters, patterns or decisions.

## 1. Snapshot ids available at evaluation time
| Flow | File | Snapshot source | Has `.id`? |
|------|------|-----------------|------------|
| Alert trigger | `commandEvaluation.service.ts` | `liveSnapshots.findLatestByFixture(fixture.id)` | **Yes** → exact trigger |
| Alert resolution | `alertResolution.service.ts` | `liveSnapshots.findAfter(...)` (array) | **Yes** (last element) → exact outcome |
| Auto opportunity | `autoEngine.service.ts` | `liveSnapshots.findLatestByFixture(fx.id)` | **Yes** → exact opportunity |
| Auto alert policy | `autoAlertPolicyEvaluation.service.ts` | reads the opportunity | inherits `opp.evidenceSnapshotId` |
| Promotion (B22/B23) | `autoOpportunityAlertPromotion.service.ts` | reads the opportunity | inherits `opp.evidenceSnapshotId` |

Conclusion: trigger / outcome / opportunity all read a real snapshot doc with an
`id` — the missing piece in B33 was simply **passing that id forward**. Policy and
promotion inherit the opportunity's `evidenceSnapshotId`.

## 2. Live write path
- `captureLiveSnapshot()` already returns `boolean` (stored). It does NOT return the
  new snapshot id. The exact links above do not need the just-written id — they use
  the snapshot the evaluator actually read (`findLatestByFixture`). So the live
  write path can expose a `LiveEvidenceContext` for diagnostics, but the trigger
  link uses the evaluator's snapshot id (the authoritative "what was evaluated").
- When a snapshot is **skipped** by the B31 guard, no new id exists; the evaluator
  still reads the previous snapshot (which has an id). Limitation `snapshot_not_written`
  is recorded only when there is genuinely no snapshot.

## 3. Where to attach ids (all optional, non-breaking)
- `SignalLedgerEntry.triggerSnapshotId?` (+ capturedAt/strength).
- `AlertOutcomeRecord.outcomeSnapshotId?` (+ capturedAt).
- `AutoOpportunity.evidenceSnapshotId?` (+ capturedAt).
- `AutoAlertPolicyEvaluation.policyEvidenceSnapshotId?`.
- `PromotedAlertProvenance.evidenceSnapshotId?` (inherited).

All optional → no migration, no breakage. Reads default to inferred when absent.

## 4. Exact link creation (non-fatal)
- `recordAlertCreated` → `linkTriggerSnapshot` (exact when id present, else window_inferred).
- `recordAlertResolved` → `linkOutcomeSnapshot`.
- auto engine write loop → `linkOpportunitySnapshot`.
- policy evaluation → `linkPolicySnapshot`.
- promotion → `linkPromotionSnapshot`.
Failure of any link NEVER blocks the alert/opportunity/policy.

## 5. Guarantees (unchanged behavior)
- No change to `evaluatePatternAgainstInput`, scoring, confidence band, risk gate,
  outcome mapping, counters, or patterns.
- Exact only with a real snapshotId; inferred otherwise; `unknown` protects.

## 6. Files touched
intelligence/evidence/evidenceContext.types.ts (new), evidenceLineage.service.ts
(+helpers), intelligence.types.ts (+optional fields), autoEngine.types.ts,
autoAlertPolicy.types.ts, intelligenceMemory.service.ts, commandEvaluation.service.ts,
alertResolution.service.ts, autoEngine.service.ts, autoAlertPolicyEvaluation.service.ts,
autoOpportunityAlertPromotion.service.ts, scripts/backfillEvidenceLineage.mjs,
scripts/smokeLiveEvidenceCapture.mjs, frontend drawers/tables + evidence types/api, docs.
