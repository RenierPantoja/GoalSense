# Backtest Lab UI — Audit (Phase B15)

Audit of the frontend integration points before building the Backtest Lab. No UI
was written during this audit.

## 1. Command Center tab system
`src/features/command/CommandCenterPage.tsx` owns:
- `type Tab = 'cockpit' | 'patterns' | 'scanner' | 'alerts' | 'performance'` + `activeTab` state.
- A `<nav>` mapping tab descriptors `{ id, label, icon, badge }` to buttons.
- A content area rendering `{activeTab === 'x' && <View …/>}`.
- `patterns` (from `usePatterns()` / PatternContext), each `Pattern` carries an
  optional **`backendId`** (set after backend sync) — the backtest backend keys
  patterns by their Firestore id, so the run must use `pattern.backendId`.
- `backendSync.online` + `getBackendUrl()` indicate backend connectivity.

**Plan:** add `'backtest'` to `Tab`, a nav entry (FlaskConical icon), and render
`<BacktestLab patterns={patterns} backendOnline={backendSync.online} />`.

## 2. Backend client
`src/services/commandBackendClient.ts` resolves the base URL (`getBackendUrl()`)
and exposes `fetchApi` (swallows non-2xx → null) + `fetchApiStrict` (throws with
`status`). For backtest we need to distinguish **403 (disabled)** from other
errors → a dedicated `backtestApi.ts` returning `{ ok, status, data, disabled, error }`.

## 3. B14 routes consumed (prefix `/api`)
- `POST /intelligence/backtest/run` (body = `BacktestRunConfig`) — **gated**: 403 when `ENABLE_BACKTEST_API` off.
- `GET  /intelligence/backtest/runs` · `/runs/:runId` · `/runs/:runId/results`
- `POST /intelligence/replay/run` (body `{ patternId, fixtureId }`) — **gated**.
- `GET  /intelligence/replay/runs/:runId`
- `GET  /intelligence/replay/patterns/:patternId/fixtures/:fixtureId` — **gated** (on-the-fly compute).

Response envelope: `{ success, data }` (200) or `{ success:false, error:{message} }`
(400/403). Disabled POST → 403 with that message.

## 4. B14 contracts mirrored on the frontend
`BacktestRun`, `BacktestRunConfig`, `BacktestSummary`, `BacktestDataCoverage`,
`BacktestLimitation`, `BacktestSignalResult` (+ persisted `id`/`runId`),
`ReplayRun`, `ReplayDecisionPoint`. Outcome union: `confirmed |
confirmed_partial | failed | unknown | not_evaluable` (+ `no_trigger` derived in
UI from `wouldTrigger === false`).

## 5. Honesty rules baked into the UI
- `unknown` and `not_evaluable` are rendered as **distinct neutral** states, never
  red/failure.
- `usefulRate` = confirmed + confirmed_partial; `failedRate` excludes
  unknown/not_evaluable; `unknownRate` explicit.
- `sampleQuality` drives an "amostra insuficiente para conclusão forte" note.
- Disabled API → blocked run button + environment notice (no fake run).
- Empty states everywhere (no patterns / no runs / no snapshots / no results).
- No green/red "win/loss" framing; backtest ≠ guaranteed projection.

## 6. Risks & handling
| Risk | Handling |
|------|----------|
| Pattern not synced to backend | run uses `backendId ?? id`; backend returns `status:failed, error:'Pattern not found'` → honest hint to sync. |
| API disabled | 403 → blocked UI + notice; never hide that it's an env gate. |
| Backend offline | `getBackendUrl()` empty → "Conecte um backend" state. |
| Large result sets | results list virtual-friendly + filters + capped fetch. |
