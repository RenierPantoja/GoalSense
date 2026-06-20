# Auto Alert Policy Engine — UI (Phase B25)

Frontend for the controlled-automation policy layer. Shadow-first is always explicit: the UI never
implies an alert was created unless the decision is `auto_created`. No betting language, no
"automatic profit", and the auto-create flag state is always visible.

## Types & API (`autoEngineTypes.ts`, `autoEngineApi.ts`)
- DTOs: `AutoAlertPolicyDto`, `AutoAlertPolicyTemplateDto`, `AutoAlertPolicyEvaluationDto`,
  `AutoAlertPolicyGateDto`, `AutoAlertPolicyOverviewDto`; labels/tones `AUTO_ALERT_MODE_LABEL`,
  `AUTO_ALERT_DECISION_LABEL`, `AUTO_ALERT_DECISION_TONE`.
- API: `listAutoAlertPolicies`, `getDefaultAutoAlertPolicyTemplate`, `getAutoAlertPolicy`,
  `createAutoAlertPolicy`, `updateAutoAlertPolicy`, `evaluateOpportunityAutoAlertPolicy`,
  `listOpportunityPolicyEvaluations`, `listAutoAlertPolicyEvaluations`, `getAutoAlertPolicyOverview`
  (all via the tagged `ApiResult` with 403/disabled handling).

## Cockpit — new "Políticas" segment
`AutoEngineCockpit` gains a fifth segment (Visão geral · Oportunidades · Bloqueadas · Calibração ·
Políticas) rendering `AutoAlertPolicyPanel`, which shows:
- `AutoAlertPolicyOverviewPanel`: automation flags (Política/Shadow/Auto-create/Telegram/To-alerts/
  Config, with danger styling for auto-create/Telegram), decision tallies (shadow never counted as
  a real alert), top block reasons, top blocked types, most restrictive policies, limitations.
- the policies list (mode + enabled + min score/sample) with an edit button;
- recent decisions with neutral decision badges and the note that "Criaria (shadow)" is not a real
  alert;
- a "Nova política" button (disabled unless `configEnabled`).

## Policy editor (`AutoAlertPolicyEditor.tsx`)
Modal to create/edit a policy: name, enabled, mode, min score, min sample quality, max per fixture/
run, allowed data quality, and toggles (require calibration / no critical blockers / learning
profile / allow unknown / allow poor). Safety:
- `auto_create_monitored` is disabled in the mode select when `createEnabled` is false;
- choosing auto-create shows a strong confirmation checkbox (required to save);
- `allowPoorData`/`allowUnknownData` show a danger warning;
- saving is disabled unless `configEnabled` (403-safe). The backend also downgrades auto-create to
  shadow when the create flag is off.

## Opportunity drawer — "Política automática" section
In the "Ações & Aprendizado" tab, the drawer fetches `listOpportunityPolicyEvaluations(id)` and
shows each decision (badge), the policy name, the top reason, failed gates, and an "Abrir alerta"
link when `promotedAlertId` exists. An "Avaliar política agora" button runs a shadow evaluation
(creates nothing unless backend flags + policy allow). Shadow decisions explicitly say "Teria
criado … mas nada foi criado".

## Alertas 2.0 integration
Auto-created alerts use `radarName='Motor Automático — Política'`, so the existing B22/B23 "Motor
Automático" origin badge (`ServerAlertList`) and the `AlertSignalDrawer` provenance banner apply.
The scope reason carries `policyId`/`evaluationId`/`opportunityId` for full traceability.

## Honest states
- Backend offline / not configured → cockpit empty note.
- Policy flag off → overview shows flags off; decisions empty; evaluations record `skipped`.
- Auto-create off → overview banner: "nenhuma política cria alerta automático".
- Config off → create/edit disabled with tooltip.

## Verification
- `npm run check:encoding` ✓ · `npx tsc --noEmit` ✓ · `npx vite build` ✓

---

## B26 — policy UI is role-gated (extension)

The "Políticas" panel uses `useAuth`: creating/editing a policy requires admin/owner + the config
flag (honest tooltip + `AdminOnlyBadge` otherwise), and the editor only offers `auto_create_monitored`
when `ENABLE_AUTO_ALERT_CREATE` is on AND the user is admin/owner. The backend remains the
authority. See [`AUTH_GUARDRAILS_UI.md`](./AUTH_GUARDRAILS_UI.md).

---

## B27 — policy UI runs on the real session (extension)

The "Políticas" panel/editor now use the real `useAuth` (Firebase session + backend role), so
admin-gated config and the `auto_create_monitored` option reflect the actual signed-in role and
permissions (not just env flags). Sensitive policy calls carry the Bearer token. See
[`FRONTEND_AUTH_SESSION.md`](./FRONTEND_AUTH_SESSION.md).
