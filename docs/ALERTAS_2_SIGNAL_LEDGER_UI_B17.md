# Alertas 2.0 — B17 (API Hardening + Related Signals)

Frontend hardening of Alertas 2.0 (B16) on top of the new B17 backend endpoints.
Read-only; honest; no alerts/Telegram/pattern changes.

## What changed in the UI
- **Period metrics strip** (`AlertOverviewStrip`) in the *Sinais* segment: Hoje /
  7 dias / 30 dias / Tudo, consuming `GET /api/intelligence/alerts/overview`
  (server-side). Loading / empty / offline states; sample-quality note. Replaces
  fragile client-side math (the existing AlertsView counts remain as a local view).
- **Signal Ledger drawer** now fetches **real** `FailureAnalysis`
  (`GET …/alerts/:id/failure-analysis`): the *Resultado* tab shows an "Análise da
  falha" block when `result === 'failed'` (reason, contributing factors,
  diagnosis confidence, suggested review), or an honest "ainda não registrada".
  `unknown`/`confirmed` never show a failure block.
- **Related alerts** (`RelatedAlertsPanel`) in the drawer's *Aprendizado* tab,
  in `PatternSignalQualityView` (expandable per radar) and in the learning
  drill-down — explainable relations with `relationReasons` + strength, labelled
  "Alertas com contexto parecido" and "não é prova".
- **Learning event drill-down** (`LearningEventDrawer`): clicking a recent event
  in *Aprendizados* opens its detail (event, related pattern profile, related
  recommendations, related alerts, "rodar backtest").

## API client (`src/services/alertIntelligenceApi.ts`)
Added: `getFailureAnalysis`, `getPatternFailureAnalyses`,
`getAlertIntelligenceOverview`, `searchAlertIntelligence`, `getRelatedAlerts`,
`getRelatedAlertsForPattern`, `getRelatedAlertsForLearningEvent`,
`getLearningEventDetail`. All GET, tolerant (null/[] on miss), typed.

## Honest states
backend offline / not configured · no overview data (empty) · no failure analysis
(failed → "ainda não registrada") · no related alerts · event not found ·
insufficient sample. Nothing invented.

## Fallback
The existing `AlertsView` list (filters, hybrid/Telegram/odds) is preserved as the
local view; the server-side overview strip sits above it. If the backend is
offline, the strip hides and the local AlertsView counts remain.

## Limitations
- Server-side **search** endpoint exists; the current list still uses the
  preserved local `AlertsView` filters (search wired via API is a follow-up to
  avoid destabilizing the heavily-wired list). Documented as next step.
- FailureAnalysis only exists for alerts the resolution worker marked `failed`.
- Related/overview depend on the Signal Ledger being populated (backend-synced alerts).
- Replay timeline still requires `ENABLE_BACKTEST_API=true`.

## Next steps
- Switch the alert list to the server-side `search` endpoint with cursor paging.
- Cache the overview per period; add CSV export.


## B18 — Scale (server-side list + cache + CSV)

The B17 limitation "the list still uses local AlertsView filters" is addressed in
B18: `ServerAlertList` (server-side `/alerts/search`, paginated + filtered) is now
the primary Sinais view, with the preserved `AlertsView` as the "Sinais locais"
toggle / no-backend fallback. Overview is cached (cacheHit shown), CSV export added
(env-gated), and related-alerts / learning-event cross-links open a pre-filtered
server list. See `docs/ALERTAS_2_SCALE_UI_B18.md`.
