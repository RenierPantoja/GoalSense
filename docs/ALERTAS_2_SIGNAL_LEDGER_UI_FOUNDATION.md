# Alertas 2.0 / Signal Ledger UI — Foundation (Phase B16)

The Alertas tab evolved from a flat list into a **Signal Ledger** centre of
traceability, results, explainability and learning — consuming B12/B13 (and B14
replay). Read-only: never creates alerts, never sends Telegram, never alters
patterns/confidence/counters.

> `unknown` and `not_evaluable` are neutral, never "failure" · `confirmed_partial`
> is partial usefulness · nothing is invented; missing data shows honest empty states.

## Shell (`AlertsIntelligencePanel`)
Premium segmented control with three views:
- **Sinais** — the existing `AlertsView` (preserved, with all Telegram/odds/hybrid
  wiring) plus a new "Ver análise" entry that opens the Signal Ledger drawer.
- **Qualidade dos padrões** — `PatternSignalQualityView` (B13 profiles).
- **Aprendizados** — `AlertLearningFeed` (B13 overview + recommendations + events).

## Signal Ledger drawer (`AlertSignalDrawer`)
Wide right drawer with 5 tabs, fetched by **backend alertId**:
- **Resumo** — fixture, competition, minute, score, radar, severity, confidence,
  match context (flagged *heurístico*), data quality, "por que alertou" (passed conditions + scope).
- **Evidências** — `SignalEvidenceSnapshot`: evaluated/passed/failed, signal vs
  eligibility, blockers, live stats used, missing data (chips, no ugly tables).
- **Resultado** — `AlertOutcomeRecord`: result, resolutionType, time to resolution,
  reason, whatConfirmed/whatFailed/missingForConfirmation, data quality at resolution.
  `unknown`/`expired` carry the "not a failure" note.
- **Linha do tempo** — real lifecycle (alerted → resolved → learning events) +
  optional "Ver replay" (reuses `ReplayViewer`, gated by `ENABLE_BACKTEST_API`).
- **Aprendizado** — `PatternLearningProfile` summary + related learning events +
  "Rodar backtest deste radar" (switches to the Backtest tab). Honest empty/low-sample notes.

## API client (`src/services/alertIntelligenceApi.ts`)
GET-only, tolerant (null/[] on miss, never throws). `getAlertIntelligenceBundle`
composes ledger + outcome + (by `ledger.patternId`) profile + learning events.

Routes consumed: `/api/intelligence/alerts/:id/ledger`, `…/outcome`,
`/api/intelligence/learning/patterns[/:id]`, `/api/intelligence/patterns/:id/learning-events`,
`/api/intelligence/learning/recommendations`, `/api/intelligence/learning/overview`,
(B14) `/api/intelligence/replay/patterns/:p/fixtures/:f`.

## Honest states
no backend · no ledger (pre-B12 / local alert) · outcome pending · unknown/expired ·
no learning / insufficient sample · replay disabled (403) · backend offline. Every
one renders a clear message — no empty holes, no invented data.

## Preserved
`AlertsView` keeps all behaviour; the only change is one optional `onOpenAnalysis`
prop + a "Ver análise" link in hybrid/backend rows. Local alerts (no backend id)
open the drawer's honest "sem ledger" state.

## Limitations (real)
- The Signal Ledger detail is only available for **backend-synced alerts** (those
  with a backend alertId). Local-only alerts show the honest "sem ledger" state.
- `SignalFailureAnalysis` has no dedicated GET endpoint yet; the drawer derives
  failure context from the outcome + the pattern's `topFailureReasons` + learning events.
- Replay timeline requires `ENABLE_BACKTEST_API=true` (B14); otherwise the lifecycle
  timeline is shown and the replay button surfaces the disabled state.
- Learning profiles depend on the B13 aggregation having run (manual or scheduled).
- No date/period server filter for alerts intelligence; metrics reflect the loaded set.

## Next steps
- Expose `SignalFailureAnalysis` via API for a richer "why failed" panel.
- Per-period alert metrics strip from a dedicated backend aggregate.
- "Ver alertas relacionados" cross-links from a learning event to its pattern's alerts.


## B17 — API Hardening + Related Signals

Phase B17 hardens this UI with dedicated backend endpoints (see
`docs/ALERTAS_2_SIGNAL_LEDGER_UI_B17.md` and
`backend/docs/ALERT_INTELLIGENCE_API_HARDENING.md`): real `FailureAnalysis` in the
Resultado tab, server-side period metrics (`AlertOverviewStrip`), explainable
related alerts (`RelatedAlertsPanel`) across the drawer / pattern quality /
learning views, and a learning-event drill-down (`LearningEventDrawer`). The B16
limitation "FailureAnalysis derived indirectly" is resolved; metrics are now
server-side instead of client-only.
