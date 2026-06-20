# Live Session Attribution UI (Phase B38)

## LiveValidationLab — "Registros vinculados (atribuição)"
- Counts of alerts/opportunities/evidence/outcomes linked to the session.
- Exact vs inferred attribution + coverage rate.
- Outcome breakdown: confirmed / parcial / falha / unknown / n/aval / pendente.
- Note: exact = stamped with sessionId; inferred = grouped by fixture/window;
  unknown/not_evaluable/pending are never failures.

## Session badges
- **AlertSignalDrawer** (Resumo): "Sessão de validação: <id…> · atribuição exata"
  when the ledger entry carries `validationSessionId`.
- **AutoOpportunityDrawer** (Resumo): same badge when the opportunity carries it.
- Legacy records without a session show nothing ("sem sessão").

## LocalOperationsPanel
- The active-session banner (B37) remains; scoped counters surface via the Lab.

## API / types
`src/services/liveValidationApi.ts` (`linkedRecords`),
`src/features/validation/liveValidationTypes.ts` (`LiveValidationLinkedRecordsDto`,
attribution/outcome fields on the summary).

## Limitations
- Per-alert/opportunity badges appear only for records created during a running
  session (exact attribution). Historical records remain grouped by fixture/window.

## B39 — Index & scoped metrics in the Lab

The Lab adds a card "Índice de registros & métricas escopadas (B39)" with index
coverage (exact/inferred/source breakdown), scoped session counters, and dynamic attach
runs, plus operator‑only buttons "Rodar anexação agora" and "Reconstruir métricas". See
`LIVE_SESSION_INDEX_UI.md`.
