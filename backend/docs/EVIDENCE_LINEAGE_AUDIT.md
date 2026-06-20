# Evidence Lineage — Audit (Phase B33)

> Map of where a real `snapshotId` exists vs where only `fixtureId`/`minute` is
> available, so evidence links carry an HONEST strength (`exact` vs inferred) and
> retention can stop over-protecting where an exact link exists.

## 1. Sources and what they carry

| Source | Has snapshotId? | Has fixtureId | Has minute/capturedAt | Link strength achievable |
|--------|-----------------|---------------|-----------------------|--------------------------|
| `SignalLedgerEntry` (B12) | **No** (evidence is a copied payload) | yes | minute, scoreState | `window_inferred` |
| `AlertOutcomeRecord` (B12/B23) | No | yes | resolutionMinute | `window_inferred` |
| `SignalFailureAnalysis` (B12) | No | yes | — | `weak_inferred` |
| `Backtest` engine | **Yes** — iterates `liveSnapshots.listRecent({fixtureId})` → each snap has `.id` | yes | capturedAt | **`exact`** |
| `Replay` engine | **Yes** — iterates snapshots (`.id`) per step | yes | capturedAt | **`exact`** |
| `LearningEvent` (B13) | No (has `evidenceRef` string only) | nullable | — | `weak_inferred` |
| `AutoOpportunity` (B19) | reads `findLatestByFixture` → `.id` available at scan | yes | minute | `strong_inferred`/`exact` if id captured |
| `AutoOpportunity` promotion (B22) | No id stored | yes | — | `window_inferred` |
| `PromotedAlert` resolution (B23) | No id stored | yes | — | `window_inferred` |
| `AutoAlertPolicyEvaluation` (B25) | No id stored | yes | — | `window_inferred` |

## 2. Key conclusions
- **Exact links** are only achievable where the engine actually iterates snapshot
  documents and has `snapshot.id`: **backtest and replay**. These reduce
  superprotection precisely.
- Everywhere else (alerts/outcomes/promotions/policy) only `fixtureId` (+ minute)
  is known at creation time → links are **inferred** (`window_inferred`), never
  `exact`. This is honest and never pretends precision.
- The live write path (`captureLiveSnapshot`) creates a snapshot with an id, but
  the consuming alert/ledger code does not currently capture that id. Capturing it
  would require touching B12 confidence/counter code paths → out of scope; we link
  conservatively (inferred) instead.

## 3. Integration points (all NON-FATAL, fire-and-forget)
- `intelligenceMemory.service.ts`: after `createSignalLedgerEntry` (trigger_state)
  and `createAlertOutcome` (outcome_state) → inferred link to latest snapshot.
- `backtestEngine.service.ts`: per signal result → **exact** trigger/outcome links
  (batched) from the iterated snapshots.
- `replayEngine.service.ts`: per replay step → **exact** link (batched).
- `autoOpportunityAlertPromotion.service.ts` / `promotedAlertResolution.service.ts`:
  inferred links to the opportunity's fixture snapshot.
- None of these change alert results, confidence, counters, or scoring.

## 4. Retention / protection
- `snapshotProtectionIndex.service.ts` consults `EvidenceSnapshotReference` first:
  an **exact** link → precise protection (`linked_to_*`); an **inferred** link →
  protection with declared strength; **no link** still falls back to protect-first
  (recent/has-alert/unknown_dependency). Exact links let us protect ONLY the
  referenced snapshots instead of every snapshot of the fixture.

## 5. Persistence
- New Firebase collection `evidenceSnapshotReferences` (indexed logically by
  snapshotId, fixtureId, source/sourceId, alertId, opportunityId). Noop honest
  under Prisma. Deterministic doc ids → idempotent links. No secrets.

## 6. Backfill
- `scripts/backfillEvidenceLineage.mjs` — dry-run default; `--persist` requires
  `ENABLE_EVIDENCE_LINEAGE_BACKFILL=true`. Creates exact links only where a
  snapshotId exists (backtest/replay results), inferred links by fixture+window
  elsewhere, never invents ids, never deletes.

## 7. Files touched
intelligence/evidence/* (new), repositories contracts + firebase + noop,
intelligenceMemory.service.ts, backtestEngine.service.ts, replayEngine.service.ts,
autoOpportunityAlertPromotion.service.ts, promotedAlertResolution.service.ts,
localops/snapshotProtectionIndex.service.ts, intelligence routes, env.ts,
scripts/backfillEvidenceLineage.mjs, scripts/smokeEvidenceLineage.mjs, frontend
evidenceLineage api/types + AlertSignalDrawer + LocalOperationsPanel + replay/backtest UI.
