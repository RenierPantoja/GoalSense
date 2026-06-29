# B68 — Live-First Signal Quality Audit

## Signal sources reviewed
- `liveSnapshotDiff.service.ts` → detected changes (score/goal/red_card/yellow/sub/status/halftime/fulltime/stats_shift/possession_shift/shots_shift/minute_changed/new_events)
- `liveMomentumInterpreter.service.ts` → derived momentum (direction/intensity/confidence/factors)
- `liveFirstVariableExtraction.service.ts` → live-first variables
- `liveFirstIntelligenceLoop.service.ts` → per-snapshot analysis
- governance (`alertDecisionGovernance`) → observe-only evaluations
- post-match sweeper → `liveFirstPostMatchOutcomes` (evaluable cases)
- `dailyValidationReports`, `liveMonitoringSessions`, `liveMonitoringFixtureStates`

## Signal types that exist today

| Signal kind | Origin | Depends on | Evidence tier (typical) |
|---|---|---|---|
| score_shift | diff (score_changed/goal_home/goal_away) | scoreboard | **strong** (placar é confiável) |
| late_goal | diff + minute > 75 | scoreboard + minute | strong–moderate |
| red_card_shift | diff (red_card_home/away) | timeline event | strong **se** evento explícito |
| pressure_shift | momentum derived | stats + diff sustained | weak–moderate |
| possession_shift | diff/stats | boxscore possession | **weak** (frequentemente ausente) |
| shots_shift | diff/stats | boxscore shots | weak–moderate |
| dangerous_attack_shift | derived | stats (raro na ESPN) | weak/insufficient |
| timeline_event_cluster | events list | summary keyEvents | moderate |
| halftime_state | diff (status HT) | status | strong (factual) |
| fulltime_resolution | diff (status FT) | status + final score | strong (factual) |
| stale_snapshot | freshness | snapshot age | n/a (quality flag) |
| missing_context | absence | lineup/injury/suspension absent | n/a (limitation) |

## Direct-from-ESPN vs derived
- **Direct (factual)**: placar, minuto, status, cartões/golos quando vêm em keyEvents, stats de boxscore quando presentes.
- **Derived**: momentum, pressure_shift, dangerous_attack — calculados a partir do diff/stats; força depende da base.

## Evidence strength
- **Strong**: score_shift, late_goal, red_card (com evento), halftime_state, fulltime_resolution.
- **Moderate**: timeline_event_cluster, shots_shift (com dados).
- **Weak/insufficient**: possession_shift, dangerous_attack_shift, pressure baseado em 1 snapshot, qualquer derivado com stats ausentes.

## Noise risk
- **Alto**: single-snapshot pressure spike, possession sem fonte, momentum com `dataQuality=poor`.
- **Médio**: shots_shift sem timeline; pressão sob placar adverso (score-effect).
- **Baixo**: score_shift confirmado, fulltime_resolution.

## Não devem virar alert candidate ainda
- possession_shift isolado, dangerous_attack_shift, pressure de 1 snapshot, qualquer sinal com `missing_context` dominante ou `stale_snapshot`.

## Limitações estruturais ESPN
- Sem lineup/lesão/suspensão pré-jogo → `missing_context`.
- Stats de boxscore nem sempre presentes → muitos derivados ficam `insufficient`.
- Delay de timeline 1–2 min → eventos podem chegar atrasados.

## Conclusão
Sinais factuais de scoreboard/status são a base confiável; sinais derivados de pressão/posse precisam de múltiplos pontos ou eventos para sair de `weak`. A camada B68 classifica cada sinal por evidência, ruído e alinhamento com o resultado — em **observe only**, sem calibração automática.
