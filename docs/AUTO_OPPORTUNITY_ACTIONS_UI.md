# Auto Opportunity Actions + Promotion — UI (Phase B21)

The Motor Automático cockpit becomes interactive: the user can save, ignore, mark
useful/not-useful, annotate, and **promote an opportunity into a radar proposal** that
opens the editor PRE-FILLED. Nothing here creates an alert, sends Telegram, uses odds,
places a bet, or saves/activates a radar automatically.

## API client (`src/services/autoEngineApi.ts`)
Added: `searchOpportunities(filters)`, `getFixtureContext(fixtureId)`,
`createOpportunityAction(id, payload)`, `listOpportunityActions(id)`,
`getOpportunityActionSummary(id)`, `sendOpportunityFeedback(id, feedbackType, note?)`,
`addOpportunityNote(id, note)`, `createPromotionPlan(id)`, `getPromotionPlan(id)`. All
403-aware and non-throwing; empty/404 never breaks the UI.

Types added to `intelligence/autoEngineTypes.ts`: `AutoOpportunityActionDto`,
`AutoOpportunityActionSummaryDto`, `AutoOpportunityPromotionPlanDto`,
`AutoOpportunityFixtureContextDto`, `AutoOpportunitySearchFilters/Response`,
`AutoOpportunityUserStateLite`, `ActionMutationResponse`, `FEEDBACK_LABEL`.

## Components
- **AutoEngineCockpit** — now loads opportunities via `searchOpportunities` (server-side
  filters) with a fallback to the plain list; keeps a `userStates` map for badges; owns
  the promotion flow (build plan → review panel → open editor) and threads cross-links.
- **AutoOpportunityDrawer** — adds a compact **action bar** (Salvar / Ignorar / Útil /
  Não útil / Criar radar) + an **Ações & Aprendizado** tab with feedback chips, a note
  box + recent notes, investigate links (backtest / alertas / criar radar), and an action
  history. "Abrir jogo no Command Center" appears in Resumo using the fixture-context
  lookup; if the live fixture can't be resolved it says so honestly. Every action calls
  the API and updates the badges; "feedback registrado — não altera o motor automaticamente".
- **AutoOpportunityPromotionPanel** — reviews the proposal (name, scope, eligibility +
  signal conditions, confidence, evidence, limitations). "Abrir editor de radar" opens
  `CustomPatternModal` pre-filled; disabled with a reason when `sufficient:false`. Message:
  "O radar será aberto para revisão; nada será salvo nem ativado sem a sua confirmação."
- **AutoOpportunitiesList** — shows saved / ignorada / feedback / nota / proposta badges
  and adds Salvas / Ignoradas / Com feedback / Com nota / Com proposta toggle filters.

## Promotion → editor (no auto-save)
`AutoEngineCockpit.onPromoteToRadar(plan)` is wired in `CommandCenterPage` to build a
`Pattern` draft (synthetic `id:'draft'`, status `paused`) from the plan's eligibility +
signal conditions and call `setPrefilledDraft + setActiveTab('patterns') + setShowBuilder(true)`
— the exact existing Match-Detail prefill path. `CustomPatternModal` persists ONLY on
explicit Salvar/Ativar; the readiness/capability matrix still gates activation.

## Open match (resolves the B20 limitation)
`CommandCenterPage.resolveAndOpenMatch(opp)` matches the opportunity's team names against
the current live `fixtures` and navigates when found; returns `false` (honest inline
message) otherwise. The drawer also shows backend fixture context from `/fixtures/:id/context`.

## Honest states
Opportunity not found (404), action API unavailable, promotion impossible (insufficient
evidence — button disabled), fixture lookup unavailable, backend offline, scan failed,
data limited. Feedback is never stored only-locally: if it doesn't persist (Prisma/Noop),
the API still responds and the badge reflects the returned state.

## Checks
`npm run check:encoding` ✓ · `npx tsc --noEmit` ✓ · `npx vite build` ✓.

## Next
Auto → Alerts with human confirmation (`ENABLE_AUTO_ENGINE_TO_ALERTS`), route auth,
structured league-tier scope, true cursor pagination for very large volumes.

---

## B22 — Promotion to monitored alert (extension)

A new auditable action `manual_alert_promoted` joins the action set. It is produced by the
B22 promotion flow (not a button in the actions panel) and carries the resulting `alertId`/
`ledgerId`; the reducer sets `promotedAlertId` on the opportunity's user-state. The drawer
surfaces this as "Abrir alerta" + a confirmation line, and the list shows a "promovida"
badge and a "Promovidas" filter. See
[`AUTO_OPPORTUNITY_ALERT_PROMOTION_UI.md`](./AUTO_OPPORTUNITY_ALERT_PROMOTION_UI.md).
