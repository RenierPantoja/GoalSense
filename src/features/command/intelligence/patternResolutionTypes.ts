/**
 * patternResolutionTypes — pattern-specific resolution classification.
 * ---------------------------------------------------------------------------------
 * Each pattern type has its own success criteria, time window, and evidence
 * requirements. This module infers the resolution type from a pattern and
 * provides the appropriate evaluation window.
 *
 * No mocks. No invented results.
 */
import type { Pattern } from '../types/commandTypes'

export type PatternResolutionType =
  | 'goal_pressure'
  | 'late_goal'
  | 'over_trend'
  | 'corner_pressure'
  | 'card_heat'
  | 'favorite_risk'
  | 'underdog_threat'
  | 'open_game'
  | 'dominance'
  | 'custom_unknown'

/**
 * Infer the resolution type from a pattern's template, name, and conditions.
 */
export function inferPatternResolutionType(pattern: Pattern): PatternResolutionType {
  // 1. Check templateId first (most reliable)
  if (pattern.templateId) {
    switch (pattern.templateId) {
      case 'pressure_for_goal': return 'goal_pressure'
      case 'dangerous_final_phase': return 'late_goal'
      case 'late_goal_likely': return 'late_goal'
      case 'over_tendency': return 'over_trend'
      case 'corners_rising': return 'corner_pressure'
      case 'cards_heating': return 'card_heat'
      case 'favorite_at_risk': return 'favorite_risk'
      case 'underdog_rising': return 'underdog_threat'
      case 'open_game': return 'open_game'
      case 'hot_second_half': return 'goal_pressure'
      case 'dominance_no_result': return 'dominance'
      case 'pressing_no_conversion': return 'dominance'
      case 'dangerous_away': return 'goal_pressure'
      case 'locked_game_rupture': return 'goal_pressure'
    }
  }

  // 2. Infer from name/description keywords
  const text = `${pattern.name} ${pattern.description || ''}`.toLowerCase()

  if (text.includes('gol tardio') || text.includes('late goal')) return 'late_goal'
  if (text.includes('pressão por gol') || text.includes('pressure for goal') || text.includes('gol provável')) return 'goal_pressure'
  if (text.includes('over') || text.includes('muitos gols')) return 'over_trend'
  if (text.includes('escanteio') || text.includes('corner')) return 'corner_pressure'
  if (text.includes('cartão') || text.includes('card') || text.includes('disciplin')) return 'card_heat'
  if (text.includes('favorito') || text.includes('favorite')) return 'favorite_risk'
  if (text.includes('zebra') || text.includes('underdog') || text.includes('azarão')) return 'underdog_threat'
  if (text.includes('jogo aberto') || text.includes('open game')) return 'open_game'
  if (text.includes('domínio') || text.includes('dominance') || text.includes('pressionando')) return 'dominance'
  if (text.includes('reta final') || text.includes('final phase') || text.includes('segundo tempo')) return 'goal_pressure'
  if (text.includes('visitante') || text.includes('away')) return 'goal_pressure'
  if (text.includes('ruptura') || text.includes('travado')) return 'goal_pressure'

  return 'custom_unknown'
}

/**
 * Get the resolution evaluation window in minutes for a pattern type.
 */
export function getResolutionWindow(resType: PatternResolutionType): number {
  switch (resType) {
    case 'goal_pressure': return 12
    case 'late_goal': return 15 // until end of match or 15 min
    case 'over_trend': return 15
    case 'corner_pressure': return 8
    case 'card_heat': return 12
    case 'favorite_risk': return 15
    case 'underdog_threat': return 12
    case 'open_game': return 15
    case 'dominance': return 15
    case 'custom_unknown': return 10
  }
}

/**
 * Determine what constitutes "confirmed" for each pattern type.
 */
export function getConfirmationCriteria(resType: PatternResolutionType): {
  strongConfirmation: string
  partialConfirmation: string
  failureCondition: string
  unknownCondition: string
} {
  switch (resType) {
    case 'goal_pressure':
    case 'late_goal':
      return {
        strongConfirmation: 'Gol dentro da janela',
        partialConfirmation: '2+ finalizações no alvo ou grande chance',
        failureCondition: 'Janela expirou sem gol e sem chance relevante',
        unknownCondition: 'Provider não entregou eventos suficientes',
      }
    case 'over_trend':
    case 'open_game':
      return {
        strongConfirmation: 'Gol dentro da janela',
        partialConfirmation: 'Pressão ofensiva bilateral com 3+ eventos',
        failureCondition: 'Jogo esfriou sem novo gol',
        unknownCondition: 'Sem eventos pós-alerta',
      }
    case 'corner_pressure':
      return {
        strongConfirmation: 'Escanteio dentro da janela',
        partialConfirmation: 'Pressão ofensiva forte continua',
        failureCondition: 'Janela acabou sem escanteio e sem pressão',
        unknownCondition: 'Provider não entrega escanteios confiáveis',
      }
    case 'card_heat':
      return {
        strongConfirmation: 'Cartão dentro da janela',
        partialConfirmation: 'Jogo segue com eventos disciplinares',
        failureCondition: 'Janela acaba sem cartão',
        unknownCondition: 'Provider não entrega cartões confiáveis',
      }
    case 'favorite_risk':
      return {
        strongConfirmation: 'Favorito sofre gol ou não vence ao final',
        partialConfirmation: 'Favorito pressionado sem reagir',
        failureCondition: 'Favorito empata/vira ou retoma controle',
        unknownCondition: 'Sem eventos suficientes',
      }
    case 'underdog_threat':
      return {
        strongConfirmation: 'Underdog marca ou mantém vantagem',
        partialConfirmation: 'Underdog continua perigoso',
        failureCondition: 'Favorito retoma controle',
        unknownCondition: 'Sem eventos suficientes',
      }
    case 'dominance':
      return {
        strongConfirmation: 'Time dominante marca gol',
        partialConfirmation: 'Pressão continua com finalizações',
        failureCondition: 'Pressão não convertida até fim da janela',
        unknownCondition: 'Sem eventos pós-alerta',
      }
    default:
      return {
        strongConfirmation: 'Evento relevante dentro da janela',
        partialConfirmation: 'Atividade relevante detectada',
        failureCondition: 'Janela expirou sem evento',
        unknownCondition: 'Dados insuficientes para avaliar',
      }
  }
}
