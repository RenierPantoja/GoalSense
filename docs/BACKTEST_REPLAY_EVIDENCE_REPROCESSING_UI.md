# Backtest/Replay Evidence Reprocessing UI (Phase B36)

## BacktestEvidenceReprocessPanel
- Shown under a completed backtest run in BacktestLab.
- "Simular reprocessamento" (dry-run, anyone with backtest access): re-evaluates and
  reports scanned / match / mismatch / patch / exact recovered / skipped.
- "Aplicar patch" (admin only, with strong confirm; backend also requires the env
  flag + operator+): writes inline snapshot ids ONLY for matched results.
- Always states: "Reprocessar evidência ≠ recalcular resultado. Exato só com
  snapshotId real; divergência nunca aplica patch."

## BacktestResultsTable
- Per result: Trigger/Outcome snapshot badges (Exato/Inferido/Ausente) plus, when
  present, the trigger identity (signalType, conditionKey) and a reprocess status
  badge ("reprocessado" / "divergência").
- Old runs without identity/evidence show: "Run legado — ... use Reprocessar
  evidência."

## ReplayViewer
- Per-step snapshot badges (B35) remain; step identity is captured for new runs and
  recovered by re-running the replay.

## Safety
- Read-only by default; patch requires admin + backend flag + strong confirm; no
  JSON dumps; honest legacy/empty states; never invents evidence.

## Limitations
- A mismatch (reprocessed result ≠ original) blocks the patch and is shown as a
  divergence — this is expected when snapshots changed.
