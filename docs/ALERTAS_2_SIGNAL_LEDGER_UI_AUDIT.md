# Alertas 2.0 / Signal Ledger UI — Audit (Phase B16)

Audit before evolving the Alertas tab. No UI changed during this audit.

## 1. Current Alertas tab
`CommandCenterPage` renders `<AlertsView …/>` with: `triggeredAlerts`
(local `TriggeredAlert[]`), `hybridAlerts` (`HybridCommandAlert[]` merged
local+backend), `hybridDiagnostics`, `backendOnline`, Telegram + odds wiring.

`AlertsView` is **heavily wired** (Telegram approval queue, send modal, odds per
alert, hybrid/source modes, filters). It must be preserved as-is.

`HybridCommandAlert` carries the join keys we need:
- `backendAlert?.id` → the **backend alert id** = the Signal Ledger key (`led_${alertId}` / `out_${alertId}`).
- `patternName`, `status`, `homeTeam`/`awayTeam`, `competition`, `minuteAtTrigger`,
  `scoreAtTrigger`, `confidence`, `evidences`, `resolvedAt`.

Local-only alerts have **no** `backendAlert` → no backend ledger (honest empty).

## 2. B12/B13 endpoints consumed (all GET, open, honest null/[])
- `GET /api/intelligence/alerts/:alertId/ledger` → `SignalLedgerEntry`
- `GET /api/intelligence/alerts/:alertId/outcome` → `AlertOutcomeRecord`
- `GET /api/intelligence/patterns/:patternId/learning-events` → `LearningEvent[]`
- `GET /api/intelligence/learning/patterns/:patternId` → `PatternLearningProfile`
- `GET /api/intelligence/learning/patterns` → `PatternLearningProfile[]`
- `GET /api/intelligence/learning/recommendations` → `LearningRecommendation[]`
- `GET /api/intelligence/learning/overview` → `LearningOverview`
- (B14, gated) `GET /api/intelligence/replay/patterns/:patternId/fixtures/:fixtureId` → on-demand timeline.

The ledger entry contains `patternId` (backend), `matchContext`, `evidence`
(SignalEvidenceSnapshot), `scopeDecision`, `dataAvailability`. The drawer fetches
the ledger by backend alertId, then uses `ledger.patternId` for learning lookups.

## 3. Plan (non-breaking)
- New `AlertsIntelligencePanel` wraps the tab with a premium segmented control:
  **Sinais** (renders the existing `AlertsView` untouched) · **Qualidade dos
  padrões** (B13) · **Aprendizados** (B13). A period-health metrics strip sits on top.
- Minimal `AlertsView` change: optional `onOpenAnalysis?(alertId|null, …)` +
  a "Ver análise" button in the hybrid/backend rows → opens `AlertSignalDrawer`.
- `AlertSignalDrawer` (5 tabs: Resumo / Evidências / Resultado / Linha do tempo /
  Aprendizado) fetches ledger + outcome + learning via `alertIntelligenceApi`.
- `PatternSignalQualityView` + `AlertLearningFeed` consume B13.
- Cross-tab "Rodar backtest" via an `onGoToBacktest` callback → `setActiveTab('backtest')`.

## 4. Honesty rules
- `unknown` / `not_evaluable` neutral, never red; `confirmed_partial` distinct.
- No ledger (local alert / pre-B12) → "Este alerta foi criado antes da memória B12."
- No outcome → "Resultado ainda não resolvido."
- No learning / low sample → "Amostra insuficiente para recomendação."
- Replay timeline only when `ENABLE_BACKTEST_API` on; else honest unavailable.
- Never invent ledger/outcome/learning; never auto-run replay/backtest.

## 5. Risks
| Risk | Handling |
|------|----------|
| Backend offline / endpoints missing | API client returns null → empty honest states. |
| Local alert without backend id | drawer shows "sem ledger" state. |
| Replay gated (403) | timeline tab shows disabled note, no auto-run. |
| Breaking AlertsView wiring | only an additive optional prop + one button. |
