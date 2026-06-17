# Radar Engine Capability — Auditoria de condições (Phase 3.1)

Auditoria de TODAS as condições do editor/receitas/backend. Fonte de verdade na
UI: `src/features/command/intelligence/radarConditionCapabilities.ts`. Espelha o
avaliador do worker (`backend/.../commandEvaluation.service.ts`) e o diagnóstico
(`backend/.../radarDiagnostic.service.ts`).

## Legenda

- **kind**: eligibility (quando avaliar) · signal (oportunidade) · context · blocker.
- **backend**: supported (avaliado e dado confiável) · partial (avaliado, cobertura
  variável) · unsupported (não avaliado pelo worker).
- **ativa?**: pode fazer parte de um radar ATIVADO.
- **diag?**: entra no diagnóstico read-only do motor.

## Tabela

| type | kind | backend | ativa? | diag? | dependências | params |
|---|---|---|---|---|---|---|
| is_live | eligibility | supported | sim | sim | status ao vivo | — |
| is_pre_live | eligibility | unsupported | não | não | status ao vivo | minutes |
| minute_between | eligibility | supported | sim | sim | minuto | min,max |
| is_final_phase | eligibility | supported | sim | sim | minuto | — |
| score_tied | signal | supported | sim | sim | placar | — |
| score_diff_lte | signal | supported | sim | sim | placar | maxDiff |
| goals_total_gte | signal | supported | sim | sim | placar | value |
| goals_total_lte | signal | supported | sim | sim | placar | value |
| home_goals_gte | signal | unsupported | não | não | placar | value |
| away_goals_gte | signal | unsupported | não | não | placar | value |
| shots_on_target_gte | signal | supported | sim | sim | chutes no alvo | value |
| home_shots_on_target_gte | signal | supported | sim | sim | chutes no alvo | value |
| away_shots_on_target_gte | signal | supported | sim | sim | chutes no alvo | value |
| shots_total_gte | signal | supported | sim | sim | finalizações | value |
| shots_recent_gte | signal | unsupported | não | não | finalizações | value |
| possession_gte | signal | supported | sim | sim | posse de bola | value |
| home_possession_gte | signal | supported | sim | sim | posse de bola | value |
| away_possession_gte | signal | supported | sim | sim | posse de bola | value |
| corners_gte | signal | partial | sim | sim | escanteios | value |
| home_corners_gte | signal | partial | sim | sim | escanteios | value |
| away_corners_gte | signal | partial | sim | sim | escanteios | value |
| cards_gte | signal | partial | sim | sim | cartões | value |
| yellow_cards_gte | signal | unsupported | não | não | cartões | value |
| red_cards_gte | signal | unsupported | não | não | cartões | value |
| favorite_involved | context | unsupported | não | não | favoritos | — |

## Resumo

- **Supported (14):** is_live, minute_between, is_final_phase, score_tied,
  score_diff_lte, goals_total_gte, goals_total_lte, possession_gte,
  home_possession_gte, away_possession_gte, shots_on_target_gte,
  home_shots_on_target_gte, away_shots_on_target_gte, shots_total_gte.
- **Partial (4):** corners_gte, home_corners_gte, away_corners_gte, cards_gte.
- **Unsupported (7):** is_pre_live, home_goals_gte, away_goals_gte,
  shots_recent_gte, yellow_cards_gte, red_cards_gte, favorite_involved.

Nenhuma condição ficou sem classificação (25/25).
