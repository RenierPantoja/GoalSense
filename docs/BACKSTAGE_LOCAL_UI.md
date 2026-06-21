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

## B40 — pre-match acquisition card

Backstage now includes a "Aquisição pré-jogo & janela de escalação (B40)" card with
provider reliability, lineup window, domain snapshots (with freshness/availability),
Readiness V2 and Precheck V2, plus admin "Buscar" / "Escalação" actions. See
`BACKSTAGE_PRE_MATCH_INTELLIGENCE_UI.md`.

## B46 — Variable Influence panel

The Backstage selected-fixture column now ends with the `VariableInfluencePanel` (B46),
after the B45 Historical Memory panel. It explains WHY the system supports, contradicts or
waits on a pattern: net influence band, internal influenceScore, assessment confidence,
positive/negative factors, blockers, wait reasons and conflicts. Influence is advisory and
never displayed as a probability; absent variables appear as uncertainty, weak samples never
strong, manual data is badged manual, conflicts are explicit. Env-gated by
`ENABLE_VARIABLE_INFLUENCE_ENGINE`; the build button needs operator. See
`docs/VARIABLE_INFLUENCE_UI.md`.

## B47 — Alert Governance panel

The Backstage selected-fixture column now ends with the `AlertGovernancePanel` (B47),
after the B46 Variable Influence panel. It shows the decision brain: governance mode
(observe/shadow/enforce), the current decision (allow/monitor/wait/block/stay-out) with
reasons and conflicts, active holds (with next re-check and resolve), live re-evaluation
buttons and a recent-decision history. In observe/shadow it never blocks a real alert;
governance is advisory and never displayed as a probability. Env-gated by
`ENABLE_ALERT_DECISION_GOVERNANCE`; POST actions need operator. See
`docs/ALERT_GOVERNANCE_UI.md`.

## B48 — Causal Learning panel + alert drawer badge

The Backstage selected-fixture column now ends with the `CausalLearningPanel` (B48), after
the B47 Governance panel. It runs post-match causal learning and shows cases (classification
+ link strength), why it worked/failed (insights), and conservative calibration suggestions
with human review (revisar / aceitar p/ futuro / rejeitar). Additionally, the alert drawer
(`AlertSignalDrawer`) now shows a compact `AlertGovernanceBadge` (governance action, mode,
would_block/would_wait, causal classification). Causal learning is observational — never a
probability, never auto-applied; nothing changes score/confidence/patterns/alerts/enforce.
See `docs/CAUSAL_LEARNING_UI.md`.
