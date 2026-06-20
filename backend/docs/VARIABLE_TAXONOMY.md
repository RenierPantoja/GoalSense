# Variable Taxonomy (B46 / Bloco 3)

`influence/variableTaxonomy.service.ts` — PURE. Central catalogue of every variable the
GoalSense can reason about. The taxonomy ONLY defines variables; it never decides
influence by itself.

## Each definition carries
- `variableKey`, `category` (VariableInfluenceCategory), `label`;
- `defaultDirection` (tendency when present + reliable — still re-evaluated by the rule
  engine);
- `absenceLimitation` — true when the variable describes an ABSENCE/limitation rather
  than a fact (e.g. `injury_data_missing`, `lineup_missing`, `provider_not_configured`).
  These never become negative facts;
- `explanation`, `defaultLimitations`.

## Groups
- **Lineup**: lineup_confirmed/missing/conflict, goalkeeper_changed, defensive_line_weakened,
  attack_weakened, heavy_rotation_detected.
- **Player importance**: key_player_missing/returned, player_importance_unknown.
- **Injury/Suspension**: key_injury_confirmed, key_suspension_confirmed,
  injury_report_unavailable, injury_data_missing, suspension_data_missing.
- **Context**: derby_or_classic, knockout_match, semi_final_or_final, relegation_pressure,
  title_pressure, low_importance_match, asymmetric_motivation, home_advantage, away_weakness.
- **Memory**: team/matchup_memory_supports/contradicts_pattern, taboo_supported/weak,
  sample_too_small, similar_scenario_supports/warns.
- **Provider/Data**: provider_domain_missing/stale, provider_not_configured,
  endpoint_not_implemented, critical_data_missing, manual_data_high_reliability,
  manual_data_conflict, evidence_missing.
- **Live**: red_card_home/away, early_goal, late_goal_pressure, substitution_key_player_out/in,
  tempo_increased/dropped, card_pressure_high, live_stats_unavailable.

## API
`listVariableCategories`, `listVariablesForCategory`, `listAllVariables`,
`getVariableDefinition`, `explainVariable`, `getDefaultDirectionRules`,
`getDefaultLimitations`, `isAbsenceLimitation`.
