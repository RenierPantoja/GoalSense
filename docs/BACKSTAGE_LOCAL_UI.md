# Backstage — Local UI

The **Backstage** tab in the Command Center (`BackstageLocalPage.tsx` +
`BackstageMatchIntelligencePanel.tsx`) is the operator view of the Match Intelligence
Fabric. It is observational: it shows when to analyze, wait, or stay out — never a
prediction, never odds, never stake.

## Sections

1. **Capacidade do provider** — summary of analyzable / unavailable / not-used (odds)
   domains for ESPN.
2. **Jogos de hoje** — today's scoped fixtures (live / pending / finished), importance,
   with an "ao vivo" filter. Honest empty state when ingestion is off or no games.
3. **Recomendação operacional** — the precheck decision (observe-first badge; "precheck
   off — não bloqueia" when disabled), its gates, and readiness.
4. **Cérebro da partida** — context (importance/volatility/rivalry=unknown/knockout),
   lineup status, injuries/suspensions (unknown), H2H reliability, tactical read, and
   home/away team memory quality, plus live state.
5. **Fatores (positivo / negativo / incerto)** — the decision-input ledger, color-coded
   by direction, with weight hint and data quality; stay-out reasons highlighted.
6. **Pós-jogo** — for finished games: why it worked/failed, unexpected events, and
   whether it was random-with-evidence / weak analysis / provider-limited.

## Actions

- **Atualizar** (admin/operator only) → `POST /fixtures/:id/refresh`, respecting the
  provider budget guard.

## Honesty in the UI

- Empty/unknown states are shown as such (no fabricated numbers).
- Odds are labelled "não usados" — not a missing critical domain.
- Lineup/injury/suspension absences are shown as `unknown`/`not_available_yet`, never as
  "nobody out".
- The recommendation is advisory; in observe mode it never blocks a real alert.

## Data source

`src/services/matchIntelligenceApi.ts` (token-aware) →
`/api/match-intelligence/*`. Types in
`src/features/matchIntelligence/matchIntelligenceTypes.ts`.
