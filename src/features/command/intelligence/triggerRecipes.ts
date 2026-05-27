/**
 * Trigger Recipes (V3.14)
 * ─────────────────────────────────────────────────────────────────────────────
 * Curated combinations of triggers. Each recipe applies multiple conditions
 * at once, deduping against existing ones (by type — first occurrence wins).
 *
 * Pure module: only data. No React, no DOM.
 */
import type { PatternCondition } from '../types/commandTypes'

export interface TriggerRecipe {
  id: string
  title: string
  description: string
  conditions: PatternCondition[]
}

export const TRIGGER_RECIPES: TriggerRecipe[] = [
  {
    id: 'r_pressure_goal',
    title: 'Pressão por gol',
    description: 'Reta final, placar curto e volume ofensivo subindo.',
    conditions: [
      { type: 'is_live', params: {} },
      { type: 'minute_between', params: { min: 55, max: 90 } },
      { type: 'score_diff_lte', params: { maxDiff: 1 } },
      { type: 'shots_on_target_gte', params: { value: 4 } },
    ],
  },
  {
    id: 'r_late_danger',
    title: 'Reta final perigosa',
    description: 'Últimos 20 minutos com placar curto e finalizações intensas.',
    conditions: [
      { type: 'is_live', params: {} },
      { type: 'minute_between', params: { min: 70, max: 90 } },
      { type: 'score_diff_lte', params: { maxDiff: 1 } },
      { type: 'shots_recent_gte', params: { value: 10 } },
    ],
  },
  {
    id: 'r_over_trend',
    title: 'Tendência de gols',
    description: 'Jogo aberto com gols somados e bom volume de chutes.',
    conditions: [
      { type: 'is_live', params: {} },
      { type: 'goals_total_gte', params: { value: 2 } },
      { type: 'shots_recent_gte', params: { value: 12 } },
    ],
  },
  {
    id: 'r_fav_at_risk',
    title: 'Favorito em risco',
    description: 'Favorito envolvido em jogo equilibrado depois do intervalo.',
    conditions: [
      { type: 'favorite_involved', params: {} },
      { type: 'is_live', params: {} },
      { type: 'minute_between', params: { min: 45, max: 90 } },
      { type: 'score_diff_lte', params: { maxDiff: 1 } },
    ],
  },
  {
    id: 'r_dangerous_away',
    title: 'Visitante perigoso',
    description: 'Visitante com posse e finalizações no alvo, placar curto.',
    conditions: [
      { type: 'is_live', params: {} },
      { type: 'away_shots_on_target_gte', params: { value: 3 } },
      { type: 'away_possession_gte', params: { value: 45 } },
      { type: 'score_diff_lte', params: { maxDiff: 1 } },
    ],
  },
  {
    id: 'r_corners_growing',
    title: 'Escanteios em crescimento',
    description: 'Volume alto de escanteios em jogo travado.',
    conditions: [
      { type: 'is_live', params: {} },
      { type: 'minute_between', params: { min: 30, max: 90 } },
      { type: 'corners_gte', params: { value: 7 } },
      { type: 'score_diff_lte', params: { maxDiff: 1 } },
    ],
  },
  {
    id: 'r_physical_match',
    title: 'Jogo físico',
    description: 'Cartões em alta a partir do meio do primeiro tempo.',
    conditions: [
      { type: 'is_live', params: {} },
      { type: 'minute_between', params: { min: 30, max: 90 } },
      { type: 'cards_gte', params: { value: 4 } },
    ],
  },
]
