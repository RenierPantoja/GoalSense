# Live Validation Lab UI (Phase B37)

A new "Validação Ao Vivo" segment in the Auto Engine cockpit organizes controlled
local validation sessions.

## Sections (single cohesive Lab)
- **Nova sessão**: name + optional leagues (comma-separated) + max fixtures (capped
  by the local guard). Creates a draft.
- **Sessões**: list with status badges; click to open.
- **Sessão (selecionada)**: status + profile/guard/env context + go/no-go badge;
  admin lifecycle actions (Iniciar/Pausar/Retomar/Concluir/Cancelar/Relatório);
  summary tiles (fixtures observed, snapshots, signals, alerts, opportunities,
  outcomes, evidence exact/inferred, provider blocks); fixtures table with coverage
  badges; cautious recommendations; operational timeline.

## Safety in the UI
- States clearly: observational; does not start workers; does not change guard mode;
  never promises hit-rate/profit. Zero odds/Telegram/auto-bet.
- Lifecycle actions are admin-only; read views are open.
- Honest empty/coverage-absent states; unknown/not_evaluable never shown as failure.

## LocalOperationsPanel integration
- Shows an "Sessão de validação ativa" banner (running/paused) pointing to this Lab.

## API / types
`src/services/liveValidationApi.ts`, `src/features/validation/liveValidationTypes.ts`.

## Limitations
- Per-alert/opportunity session badges and deep cross-links are not implemented in
  B37 (sessions group by fixture/window, not per-record tag). See
  `backend/docs/LIVE_VALIDATION_SESSIONS.md`.
