/**
 * Auto Engine pt-BR labels (Phase B22) — pure, env-free.
 */
import type { OpportunityType } from '../autoEngine.types.js'

export const OPP_TYPE_LABEL: Record<OpportunityType, string> = {
  late_goal_pressure: 'Pressão por gol — reta final',
  first_half_goal_pressure: 'Pressão por gol — 1º tempo',
  corners_pressure: 'Pressão de escanteios',
  cards_pressure: 'Jogo quente — cartões',
  comeback_pressure: 'Pressão de virada',
  dominant_home_pressure: 'Domínio do mandante',
  dominant_away_pressure: 'Domínio do visitante',
  pattern_similarity: 'Contexto parecido com radar',
  unknown: 'Oportunidade',
}
