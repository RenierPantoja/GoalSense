# Auto Opportunity → Monitored Alert Promotion — UI (Phase B22)

Frontend for promoting a **strong** / **watch** automatic opportunity into a **monitored
alert** from the "Motor Automático" cockpit. Human-confirmed only. No Telegram, no odds,
no bet. Opportunity ≠ alert; score ≠ probability.

## Entry points
- **Opportunity drawer action bar** (`AutoOpportunityDrawer.tsx`)
  - When the opportunity is `strong`/`watch` and not yet promoted → **"Promover p/ alerta"** (BellRing).
  - When already promoted → **"Abrir alerta"** (jumps to the Alertas tab) plus the line
    "Alerta monitorado criado a partir desta oportunidade."
  - The drawer derives `promotedAlertId` from the action summary and `promotable` from status.
- **Opportunities list** (`AutoOpportunitiesList.tsx`)
  - A "promovida" badge (BellRing) on rows whose user-state carries `promotedAlertId`.
  - A "Promovidas" toggle filter.

## Promotion panel (`AutoOpportunityAlertPromotionPanel.tsx`)
Centered modal opened by the cockpit. Flow:
1. Loads the preview via `autoEngineApi.getAlertPromotionPreview(opportunityId)`.
2. Shows **what will be monitored** (title, reason, severity, confidence — labeled
   "qualidade de sinal, não probabilidade"), **evidence**, **risks**, **limitations**.
3. If `!canPromote` → an honest block panel listing `blockedReasons` (mapped via
   `PROMOTION_BLOCK_LABEL`). No confirm button.
4. If promotable → **three mandatory acknowledgements** (not a guarantee / no Telegram /
   no odds). The "Criar alerta monitorado" button is disabled until all three are checked.
5. On submit → `promoteOpportunityToAlert` with `userConfirmed:true`,
   `confirmationMode:'explicit_click'`, and the three acks. A `403` shows a disabled
   message; success shows the created `alertId` and an "Abrir em Alertas →" button.

## Cockpit wiring (`AutoEngineCockpit.tsx`)
- `alertPromotionOppId` state holds the opportunity being promoted.
- `handlePromoteToAlert(opp)` closes the drawer and opens the panel.
- `handlePromoted(opportunityId, alertId)` writes `promotedAlertId` into local `userStates`
  so the list badge/filter update immediately.
- The panel receives `onGoToAlerts` (the cockpit's existing alerts-tab callback).

## CommandCenter wiring (`CommandCenterPage.tsx`)
`<AutoEngineCockpit … onGoToAlerts={() => setActiveTab('alerts')} … />` — the promote-to-alert
flow is self-contained (uses `autoEngineApi` directly); no new page-level prop required.

## Alertas 2.0 origin badge (`ServerAlertList.tsx`)
A purely client-derived "Motor Automático" badge appears on alert rows whose `patternName`
starts with "Motor Automático" (the promoted alert's `radarName`). No backend search-shape
change. Provenance detail is already visible in the `AlertSignalDrawer` Resumo via
`scopeDecision.reason`.

## Types & API (`autoEngineTypes.ts`, `autoEngineApi.ts`)
- DTOs: `ManualAlertPromotionPreviewDto`, `ManualAlertPromotionRequestDto`,
  `ManualAlertPromotionResultDto`, `ManualPromotedAlertLinkDto`; `PROMOTION_BLOCK_LABEL`.
- `AutoOpportunityUserStateLite` and `AutoOpportunityActionSummaryDto` gain `promotedAlertId?`.
- API methods: `getAlertPromotionPreview`, `promoteOpportunityToAlert`, `getPromotedAlert`.
  All return the tagged `ApiResult` (`ok` / `disabled` / `error`) — never throw.

## Honest states
- Backend offline / not configured → cockpit shows the existing empty note; no promotion.
- Promotion flag off → POST returns `403` → panel shows a disabled message (preview still loads).
- Not promotable → block panel with reasons; no confirm path.
- Duplicate → result panel says "Alerta já existente" with the existing `alertId`.

## Verification
- `npm run check:encoding` ✓ · `npx tsc --noEmit` ✓ · `npx vite build` ✓
