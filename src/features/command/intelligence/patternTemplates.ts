/**
 * Pattern templates — real, useful starting patterns for the Command Center.
 */
import type { PatternTemplate } from '../types/commandTypes'

export const PATTERN_TEMPLATES: PatternTemplate[] = [
  {
    id: 'pressure_for_goal',
    name: 'Pressão por gol',
    description: 'Time com crescimento ofensivo, finalizações recentes e placar curto. Alta probabilidade de gol iminente.',
    severity: 'critical',
    defaultConfidence: 'alta',
    conditions: [
      { type: 'is_live', params: {} },
      { type: 'minute_between', params: { min: 55, max: 90 } },
      { type: 'score_diff_lte', params: { maxDiff: 1 } },
      { type: 'shots_on_target_gte', params: { value: 4 } },
    ],
  },
  {
    id: 'dangerous_final_phase',
    name: 'Reta final perigosa',
    description: 'Jogo entre 70\' e 90\' com placar apertado e volume ofensivo. Momento decisivo.',
    severity: 'critical',
    defaultConfidence: 'alta',
    conditions: [
      { type: 'is_live', params: {} },
      { type: 'is_final_phase', params: {} },
      { type: 'score_diff_lte', params: { maxDiff: 1 } },
      { type: 'shots_recent_gte', params: { value: 3 } },
    ],
  },
  {
    id: 'favorite_at_risk',
    name: 'Favorito em risco',
    description: 'Favorito empatando ou perdendo com pressão adversária. Situação de alerta.',
    severity: 'attention',
    defaultConfidence: 'média',
    conditions: [
      { type: 'is_live', params: {} },
      { type: 'favorite_involved', params: {} },
      { type: 'score_tied', params: {} },
      { type: 'minute_between', params: { min: 45, max: 90 } },
    ],
  },
  {
    id: 'dominance_no_result',
    name: 'Domínio sem resultado',
    description: 'Time dominante em posse e finalizações sem vantagem no placar. Pressão crescente.',
    severity: 'attention',
    defaultConfidence: 'média',
    conditions: [
      { type: 'is_live', params: {} },
      { type: 'possession_gte', params: { value: 62 } },
      { type: 'shots_on_target_gte', params: { value: 5 } },
      { type: 'score_diff_lte', params: { maxDiff: 0 } },
    ],
  },
  {
    id: 'corners_rising',
    name: 'Escanteios em crescimento',
    description: 'Sequência de pressão territorial com escanteios acumulados. Indica domínio ofensivo.',
    severity: 'info',
    defaultConfidence: 'média',
    conditions: [
      { type: 'is_live', params: {} },
      { type: 'corners_gte', params: { value: 7 } },
      { type: 'minute_between', params: { min: 30, max: 90 } },
    ],
  },
  {
    id: 'open_game',
    name: 'Jogo aberto',
    description: 'Troca de ataques com volume dos dois lados. Jogo imprevisível e emocionante.',
    severity: 'info',
    defaultConfidence: 'média',
    conditions: [
      { type: 'is_live', params: {} },
      { type: 'shots_recent_gte', params: { value: 12 } },
      { type: 'goals_total_gte', params: { value: 2 } },
    ],
  },
  {
    id: 'hot_second_half',
    name: 'Segundo tempo quente',
    description: 'Jogo que acelerou após o intervalo com volume ofensivo crescente.',
    severity: 'attention',
    defaultConfidence: 'média',
    conditions: [
      { type: 'is_live', params: {} },
      { type: 'minute_between', params: { min: 50, max: 75 } },
      { type: 'shots_recent_gte', params: { value: 8 } },
      { type: 'score_diff_lte', params: { maxDiff: 1 } },
    ],
  },
  {
    id: 'underdog_rising',
    name: 'Zebra em formação',
    description: 'Azarão performando acima do esperado contra favorito. Resultado surpreendente em construção.',
    severity: 'attention',
    defaultConfidence: 'baixa',
    conditions: [
      { type: 'is_live', params: {} },
      { type: 'minute_between', params: { min: 45, max: 90 } },
      { type: 'score_diff_lte', params: { maxDiff: 0 } },
      { type: 'shots_on_target_gte', params: { value: 3 } },
    ],
  },
]
