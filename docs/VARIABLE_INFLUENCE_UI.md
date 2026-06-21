# Variable Influence UI (B46 / Bloco 3)

Backstage panel surfacing the variable-influence layer per fixture.

## Files
- `src/features/matchIntelligence/variableInfluenceTypes.ts` — DTOs + labels.
- `src/services/variableInfluenceApi.ts` — read-only GETs + operator POST builds.
- `src/features/command/components/views/backstage/VariableInfluencePanel.tsx` — panel.
- Wired into `BackstageMatchIntelligencePanel.tsx` (selected-fixture column, after the
  B45 Historical Memory panel).

## What it shows
- **Resumo**: net influence band, internal influenceScore, confidenceOfAssessment, data
  completeness, pattern family note.
- **Fatores positivos / negativos**: variável, magnitude, reliability, fonte.
- **Bloqueadores**: o que impede a decisão e por quê.
- **Esperar**: lineup / domínio / live confirmation / manual review.
- **Conflitos**: provider × manual, memória × escalação, H2H × contexto, etc., com ação
  recomendada (advisory).
- **Incertezas**: variáveis de ausência/limitação (nunca tratadas como negativas).

## Permissions
GET endpoints are env-gated (`ENABLE_MATCH_INTELLIGENCE` + `ENABLE_VARIABLE_INFLUENCE_ENGINE`).
The "Reconstruir" button (POST build) requires operator (`run:scan`) and shows only to admin.

## Honest framing
Influence is operational weight + assessment confidence — **never a probability** and never
betting language. Absent variables are shown as uncertainty/limitations, weak samples are
never strong, manual data is badged manual, and conflicts are always explicit. The panel
never changes score/confidence/patterns/alerts.

## Endpoints used
`/api/match-intelligence/fixtures/:id/influence` (+`/influence/build`),
`.../patterns/:patternId/influence` (+build), `.../package-v5`, `.../readiness-v7`,
`.../precheck-v7`, `.../post-match-explanation-v5`, `/influence/build-runs`.

## Followed by the Alert Governance panel (B47)

Below the Variable Influence panel, the Backstage selected-fixture column now renders the
`AlertGovernancePanel` (B47): governance mode, current decision (allow/monitor/wait/block/
stay-out), reasons, active holds and live re-evaluation. Advisory only; in observe/shadow
it never blocks a real alert. See `docs/ALERT_GOVERNANCE_UI.md`.
