# Backtest/Replay Inline Evidence UI (Phase B35)

## BacktestResultsTable
- Each expanded result row shows an "Evidência" line with two badges:
  - **Trigger**: Exato (real snapshotId) / Inferido / Ausente.
  - **Outcome**: Exato / Inferido / Ausente.
- Tooltip per badge: short snapshotId, minute, capturedAt, and any limitation.
- Old runs without inline fields show: "Sem evidência inline neste run (rode o
  backtest novamente para captura exata)."

## BacktestCoveragePanel
- New "Cobertura de rastreabilidade (B35)" block: counts of exact trigger / exact
  outcome / any evidence / no evidence, plus exact/inferred/missing rates and the
  most common limitations.
- Explicit note: traceability ≠ hit-rate.

## ReplayViewer
- Header: "N/M passos com snapshot exato" summary badge.
- Each timeline step shows a "snapshot exato" badge (with tooltip) when a real id
  exists, or "sem snapshot" with the limitation otherwise.

## Safety
- Read-only; no JSON dumps; honest empty/legacy states; never invents evidence.
- Uses only data already returned by the run/replay response — no per-row/per-step
  extra API calls.

## Limitations
- Outcome badge reflects the most-recent in-window snapshot (real id, approximate
  minute). Pre-B35 runs need a re-run to show inline badges.

---

## B36 additions
The results table shows trigger identity (signalType/conditionKey) and a reprocess
status badge; legacy runs show "Run legado". A "Reprocessar evidência" panel allows
dry-run simulation and (admin + flag) inline patch. See
`BACKTEST_REPLAY_EVIDENCE_REPROCESSING_UI.md`.
