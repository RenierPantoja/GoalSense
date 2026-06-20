# Historical Memory UI (B45 / Bloco 2)

Backstage panel surfacing the historical-memory layer per fixture.

## Files
- `src/features/matchIntelligence/historicalMemoryTypes.ts` — DTOs + labels.
- `src/services/historicalMemoryApi.ts` — read-only GETs + operator POST builds.
- `src/features/command/components/views/backstage/HistoricalMemoryPanel.tsx` — panel.
- Wired into `BackstageMatchIntelligencePanel.tsx` (selected-fixture column, after the
  B44 Critical Domain panel).

## What it shows
- **Readiness V6** badge (state + memory score + reliability; support/contra/misleading
  flags).
- **Team memory** (home/away): state, sample quality, recent vs total cases, top
  context behaviors; `insufficient_history` shown as honest, not negative.
- **Matchup memory**: matches found, state; `insufficient_data` labeled "não é tabu".
- **Pattern × context**: counts + recommendation (use_with_confidence / caution /
  stay_out / monitor).
- **Taboos**: usable vs total, each with status badge (mostly NOT usable).
- **Similar scenarios**: similarity score + observed outcome, with the explicit caveat
  "retrieval ≠ prediction".

## Permissions
GET endpoints are env-gated only (`ENABLE_MATCH_INTELLIGENCE`). The "Construir memória"
button (POST) requires operator (`run:scan`) and is shown only to `isAdmin`.

## Endpoints used
`/api/match-intelligence/fixtures/:id/memory`, `.../matchup-memory`, `.../taboos`,
`.../similar-scenarios`, `.../pattern-memory`, `.../readiness-v6`,
`.../memory/build` (POST), plus `teams/:teamId/fundamental-memory`,
`memory/today/build`, `memory/build-runs`, `memory/status`.

## Honest framing
Reliability is data-confidence, not a probability of winning. The panel never displays
an invented prediction, odds or stake; it only explains what the GoalSense remembers
and how trustworthy that memory's sample is.
