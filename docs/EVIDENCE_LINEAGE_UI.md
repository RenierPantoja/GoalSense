# Evidence Lineage UI (Phase B33)

## Alertas 2.0 — AlertSignalDrawer → aba "Evidências"
New "Evidência & Linhagem" block:
- Exact vs inferred link counts.
- Per-link rows: strength badge (Exato/Inferido), source (Alerta/Outcome/Backtest/
  Replay/Oportunidade), evidence kind, and snapshot id (or minute when inferred).
- "Superproteção conservadora" note when there are no exact links.
- Honest empty state: "Este alerta foi criado antes do índice de evidências ou não
  possui snapshot vinculado."
- Always: "Vínculo inferido nunca finge ser exato. Unknown não autoriza exclusão."

## ReplayViewer
- Header badge with the fixture's evidence lineage summary (`N exato · M inferido`),
  read-only.

## LocalOperationsPanel — Ciclo de vida de snapshots
- Note that protection now uses the evidence lineage index (exact > inferred) and
  points to the per-alert trail in Alertas 2.0 → Evidências.

## API / types
`src/services/evidenceLineageApi.ts`: `getSnapshotLineage`, `getFixtureLineage`,
`getAlertLineage`, `getOpportunityLineage`, `searchEvidenceLineage`,
`runEvidenceBackfill`. Types in `evidenceLineageTypes.ts`
(`EvidenceSnapshotReferenceDto`, `EvidenceLineageBundleDto`, `EvidenceLinkStrengthDto`,
`EvidenceLinkSourceDto`, `EvidenceKindDto`, `EvidenceLineageSearchParams`).

## Safety
- All views are read-only; no JSON dumps; honest empty states; never invents evidence.
- Backfill action is admin/owner + env-gated on the backend.

## Limitations
- Backtest results table does not yet render per-result trigger/outcome snapshot
  badges inline (lineage is available via the evidence API and the alert drawer);
  step-level snapshot ids are not carried in the replay timeline type.

---

## B34 additions
The alert drawer now shows exact trigger/outcome snapshot links (when captured live);
the AutoOpportunityDrawer gains an "Evidência da oportunidade" section
(evidenceSnapshotId / capturedAt / minute / exact badge). See `INLINE_EVIDENCE_UX.md`.

---

## B35 additions
Backtest results table shows per-row Trigger/Outcome snapshot badges (exato/inferido/
ausente), the coverage panel shows a traceability block, and the replay viewer shows
per-step snapshot badges. See `BACKTEST_REPLAY_INLINE_EVIDENCE_UI.md`.

---

## B36 additions
The Backtest Lab gains a "Reprocessar evidência" panel (dry-run for all; inline
patch for admin + backend flag) and the results table shows trigger identity +
reprocess status. See `BACKTEST_REPLAY_EVIDENCE_REPROCESSING_UI.md`.
