# Live Session Index — UI (B39)

The B39 surface lives inside the **Validação Ao Vivo** segment of the AutoEngine
Cockpit (`LiveValidationLab.tsx`). It extends the B37/B38 session view with an index,
scoped metrics, and dynamic attach controls.

## "Índice de registros & métricas escopadas (B39)" card

Shown when a session is selected. Three blocks:

1. **Cobertura do índice** — total indexed links, exact vs inferred, and index
   coverage rate. Plus a per‑source breakdown: `índice` (exact, in the index),
   `registro direto` (record carries sessionId but not yet indexed), `fallback janela`
   (legacy B38 fixture/window grouping), and `anexadas dinâmico`.
2. **Métricas escopadas por sessão** — operational counters scoped to the session
   (snapshots, signals, alerts, opportunities, policy evaluations, outcomes, provider
   blocks, guard blocks). A line states the metrics source: `counters por sessão (B39)`
   or `janela por fixture (fallback)`. These are counters, **not** probabilities and
   never a hit‑rate.
3. **Anexações dinâmicas** — recent dynamic attach runs (time, attached count, scan/
   match/skip, status).

## Actions (operator+ / admin only)

- **Rodar anexação agora** → `POST :id/dynamic-attach/run`. Scans collected live data
  and attaches newly‑eligible fixtures (respects the local cap). Visible only while the
  session is `running`/`paused`.
- **Reconstruir métricas** → `POST :id/metrics/rebuild`. Recomputes the scoped counters
  deterministically from the index.

Both are hidden for non‑admins; the GET reads remain visible to everyone with access.

## Honesty notes shown in the UI

- The index is auxiliary, never the source of truth; legacy data falls back to
  fixture/window grouping.
- Dynamic attach uses only already‑collected data (no provider call by default) and
  respects the local cap.
- Counters do not replace score/confidence; `unknown`/`not_evaluable`/`pending` are
  never failures.

## LocalOperationsPanel

The dynamic attach scheduler appears automatically in the workers list (`dynamicFixtureAttach`,
recommended local state `limited`, pausable at runtime). No separate wiring needed.

## Drawers

`AlertSignalDrawer` / `AutoOpportunityDrawer` continue to show the B38 session badge.
The per‑record index source (index‑exact vs direct‑record vs fixture‑window) is
surfaced in the Lab's coverage block rather than per row in the drawers, to avoid an
extra per‑record lookup in the hot drawer path.
