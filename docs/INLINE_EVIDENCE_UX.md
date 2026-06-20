# Inline Evidence UX (Phase B34)

Surfaces the captured snapshot evidence inline, with honest exact vs inferred badges.

## AlertSignalDrawer → "Evidência & Linhagem"
- Exact links (now produced for triggers/outcomes when a real snapshotId exists) are
  badged "Exato"; inferred links are badged accordingly.
- Per-link rows show source (Alerta/Outcome/Backtest/Replay/Oportunidade) and the
  evidence kind (`trigger_state` / `outcome_state` / …), so the user reads "snapshot
  do gatilho" vs "snapshot do resultado".
- "Superproteção conservadora" note when there are no exact links.
- Honest empty state when the alert predates evidence capture.

## AutoOpportunityDrawer → "Evidência da oportunidade"
- Shows `evidenceSnapshotId` (truncated), `capturedAt`, `minute`, and an Exact badge
  when present; otherwise an honest inferred note.
- States clearly: the link never alters score or decision (audit + retention only).

## ReplayViewer
- Header badge: fixture evidence lineage summary (`N exato · M inferido`).

## LocalOperationsPanel
- Retention section notes protection now uses the lineage index (exact > inferred),
  pointing to the per-alert trail in Alertas 2.0 → Evidências.

## Safety
- Read-only views; no JSON dumps; honest empty states; never invents evidence.

## Limitations
- BacktestResultsTable does not yet render per-row trigger/outcome snapshot badges
  (the persisted backtest result has no snapshot-id field; run-level exact links
  exist via the evidence API). Replay timeline steps do not carry per-step snapshot
  ids in the timeline type — fixture-level lineage summary is shown instead.

---

## B35 additions
The B34 limitation is closed: BacktestResultsTable now renders per-row trigger/
outcome snapshot badges, BacktestCoveragePanel shows traceability coverage, and the
ReplayViewer shows per-step snapshot badges. See `BACKTEST_REPLAY_INLINE_EVIDENCE_UI.md`.
