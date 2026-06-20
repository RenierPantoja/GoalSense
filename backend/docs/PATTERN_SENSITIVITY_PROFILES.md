# Pattern Sensitivity Profiles (B46 / Bloco 3)

`influence/patternSensitivity.service.ts` — PURE. Knows which variables matter for each
pattern family, so the same variable weighs differently per pattern. Advisory; never
alters patterns.

## Pattern families
goals, btts, clean_sheet, comeback, late_goal, first_half_goal, second_half_goal, cards,
red_card, pressure, momentum, defensive_collapse, favorite_dominance, underdog_resistance,
unknown.

`inferPatternFamily(pattern)` deterministically maps a pattern's id/name/type via keyword
match. A pattern with **unknown family falls back to a conservative profile** (no critical
variables; nothing becomes strong without confirmation).

## Profile fields
`sensitiveCategories`, `criticalVariables`, `blockingVariables`, `waitVariables`,
`liveConfirmationVariables`, `lowImpactVariables`, `notes`, `limitations`.

## Examples
- **goals**: ataque enfraquecido pesa negativo; defesa adversária enfraquecida positivo;
  lineup ausente → wait; vermelho muda o contexto; ausência de artilheiro pesa alto SE a
  importância for conhecida.
- **cards**: clássico/mata-mata/pressão pesam positivo; árbitro desconhecido → incerteza;
  card memory alta pesa positivo; dado de cartões ausente limita.
- **clean_sheet**: zaga desfalcada/goleiro reserva negativo; adversário sem atacante-chave
  positivo; H2H antigo não pesa forte.
- **late_goal**: substituições, cansaço, pressão, estado do placar, memória de gols tardios.

## API
`getPatternSensitivityProfile`, `getSensitiveVariables`, `inferPatternFamily`,
`explainPatternSensitivity`.
