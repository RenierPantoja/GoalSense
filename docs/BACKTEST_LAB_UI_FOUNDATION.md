# Backtest Lab UI — Foundation (Phase B15)

The first visual Backtest & Replay experience inside the Command Center,
consuming the B14 backend. Premium, honest, read-only.

> Backtest ≠ guaranteed projection · `unknown` and `not_evaluable` are distinct
> neutral states, never "failure" · `confirmed_partial` is partial usefulness ·
> no alerts, no Telegram, no pattern/confidence changes from the UI.

## Where it lives
New **Backtest** tab in `CommandCenterPage` (`type Tab … | 'backtest'`,
FlaskConical icon) rendering `<BacktestLab patterns backendOnline />`.

## Components (`src/features/command/components/views/backtest/`)
- `BacktestLab.tsx` — shell + orchestrator: form state, run, results, history,
  replay; honest states (no backend / API disabled / no patterns / no results).
- `BacktestConfigPanel.tsx` — radar select (real patterns, no mock), period,
  leagues/teams, maxFixtures (capped 300), includeUnknown, strict|diagnostic,
  run button (blocked when API disabled / backend not connected / pattern not synced).
- `BacktestSummaryPanel.tsx` — usefulRate (confirmed+partial) / failedRate
  (excludes unknown & not_evaluable) / unknownRate (explicit), counts, sample
  quality note, best minute windows / competitions (flagged "indício").
- `BacktestCoveragePanel.tsx` — fixtures found/with/without snapshots, snapshots
  evaluated, data-quality stacked bar, provider chips, limitations, and the
  "jogos sem snapshots não são falha" note.
- `BacktestResultsTable.tsx` — premium expandable rows, filters
  (confirmed/partial/failed/unknown/not_evaluable/no_trigger), search, matched/
  missing conditions, blockers, "Ver replay".
- `ReplayViewer.tsx` — wide modal; minute-by-minute timeline with passed/missing
  conditions, blockers, confidence, data quality, first-trigger minute, estimated
  outcome; read-only notice.
- `BacktestRunsHistory.tsx` — past runs with honest empty state.

## API client (`src/services/backtestApi.ts`)
Reuses `getBackendUrl()`. Returns `{ ok, status, data, disabled, error }` so the
UI distinguishes **403 (ENABLE_BACKTEST_API off)** from other errors. Methods:
`runBacktest`, `listBacktestRuns`, `getBacktestRun`, `getBacktestResults`,
`runReplay`, `getReplayRun`, `getReplayForPatternFixture`. Never throws.

## Routes consumed
`POST /api/intelligence/backtest/run`, `GET …/backtest/runs[/:id[/results]]`,
`POST /api/intelligence/replay/run`,
`GET …/replay/runs/:id`, `GET …/replay/patterns/:patternId/fixtures/:fixtureId`.

## States
no-backend · API disabled (403) · no patterns · no runs · no snapshots / no
results (explained as coverage, not failure) · running · completed · failed
(incl. "Pattern not found" → hint to sync the radar to the backend).

## Pattern id mapping
Local patterns carry `backendId` after sync. The run uses `pattern.backendId ??
pattern.id`; replay uses the run's `patternId` (already a backend id). Unsynced
radars are flagged in the config panel.

## unknown / not_evaluable
Rendered with neutral tones. `failedRate` never includes them. Coverage surfaces
how much of the sample was non-evaluable due to missing snapshots.

## Security
POST endpoints are env-gated (`ENABLE_BACKTEST_API`) but not auth-protected
(B14). The UI hides the run button and shows an environment notice when the API
responds 403; it never presents the POST as a ready public feature.

## Limitations (real)
- Backtest strength is bounded by recorded snapshots (no snapshots → not_evaluable).
- No date-range fixture index server-side → period filter is applied in memory + capped.
- Replay/run compute requires `ENABLE_BACKTEST_API=true`; otherwise read-only views only.
- POST endpoints are not authenticated yet (env-gated only).
- Learning (B13) contextual links are not wired in this phase (future connection).

## Next steps
- Wire B13 "Ver perfil deste radar / recomendações" contextual links.
- Sort/group results by competition or minute window; export.
- Save/compare runs side by side.
