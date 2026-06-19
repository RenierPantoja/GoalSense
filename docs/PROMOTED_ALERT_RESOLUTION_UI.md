# Promoted Alert Resolution + Outcome Loop — UI (Phase B23)

Surfaces, in the frontend, the outcome of a manually-promoted alert (B22) once it resolves —
inside the originating opportunity, in the opportunities list, in the cockpit overview, and in
Alertas 2.0. Outcome is an informational, posterior layer: it never changes the opportunity
score, never uses betting language, and `unknown` is always neutral (never a failure).

## Types & API (`autoEngineTypes.ts`, `autoEngineApi.ts`)
- DTOs: `AutoOpportunityOutcomeSummaryDto`, `PromotedAlertOutcomeLinkDto`,
  `PromotedAlertListItemDto`, `PromotedAlertResolutionStatusDto`; `PromotedAlertResult`.
- Labels/tones: `PROMOTED_RESULT_LABEL`, `PROMOTED_RESULT_TONE` (neutral palette).
- `AutoOpportunityUserStateLite` / `AutoOpportunityActionSummaryDto` gain
  `promotedAlertOutcome` (+ `promotedAlertResolvedAt`).
- API: `getOpportunityOutcomeSummary`, `getPromotedAlertOutcomeLink`, `listPromotedAlerts`,
  `resolvePromotedAlertNow` (all via the tagged `ApiResult`).

## AutoOpportunityDrawer — "Resultado do alerta promovido"
A Resumo-tab section (shown when the opportunity was promoted or has an outcome). It fetches
`getOpportunityOutcomeSummary(opportunityId)` and renders:
- a neutral result badge (`Pendente` / `Confirmado` / `Parcial (útil)` / `Não confirmado` /
  `Sem dados`), time-to-resolution, and an "Abrir alerta →" shortcut;
- the outcome reason; for `unknown`, the missing-data explanation;
- the fixed disclaimer: "Este resultado avalia o alerta monitorado criado manualmente — não
  altera o score original da oportunidade."
`pending` shows "aguardando dados pós-promoção".

## AutoOpportunitiesList — badges + filter
- A neutral outcome badge per row (derived from `st.promotedAlertOutcome`, or `pending` when
  promoted-but-unresolved), next to the existing "promovida" badge.
- A "Resultado promovido" select filters by `pending | confirmed | confirmed_partial | failed |
  unknown`. Outcome never replaces the opportunity's own status — it's a separate layer.

## AutoEngineCockpit / OverviewPanel — metrics
The cockpit fetches `listPromotedAlerts(200)` and passes them to `AutoEngineOverviewPanel`,
which renders an "Alertas promovidos (resultado)" card: total, pending, confirmed, partial,
failed, unknown, plus "úteis (confirmado+parcial)" and "sem dados/unknown" with the sample size.
Explicitly labeled **not** a hit-rate; unknown is never a failure; score is not probability.

## Alertas 2.0 — `AlertSignalDrawer`
- Resumo: a "Origem: Motor Automático" banner for promoted alerts (derived from
  `radarName`/`patternName` prefix) with the scope reason (carries the opportunityId) and the
  no-Telegram/no-odds disclaimer.
- Resultado: when `resolutionType` starts with `promoted`, shows "Fonte da resolução: Motor
  Automático (promoted_alert_resolution)" and, for `unknown`/`expired`, a limited-resolution note.
- The existing "Sinais" list keeps the "Motor Automático" origin badge from B22.

## Honest states
- Backend offline / not configured → cockpit empty note; no metrics.
- Not promoted → drawer section says so.
- Promoted but unresolved → `pending` everywhere.
- `unknown` → neutral amber, explains missing data; never failure language.

## Verification
- `npm run check:encoding` ✓ · `npx tsc --noEmit` ✓ · `npx vite build` ✓

---

## B24 — calibration views (extension)

Promoted-alert outcomes now also surface as a calibration layer: a "Calibração" segment in the
cockpit, a calibration-context section in the opportunity drawer ("Contexto histórico"), and a
"Maturidade do motor" card in the overview. Observational only; score is never rewritten. See
[`AUTO_ENGINE_CALIBRATION_UI.md`](./AUTO_ENGINE_CALIBRATION_UI.md).
