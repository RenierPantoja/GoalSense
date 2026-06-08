import type { OddsMarketType } from './oddsProvider.types.js'

/**
 * Infers likely betting markets based on an alert's pattern type.
 */
export function inferMarketFromPatternType(patternType: string): OddsMarketType[] {
  switch (patternType) {
    case 'goal_pressure':
    case 'late_goal':
    case 'over_trend':
      return ['over_under_goals', 'next_goal', 'both_teams_score']
    case 'corner_pressure':
      return ['corners']
    case 'card_heat':
      return ['cards']
    case 'favorite_risk':
    case 'underdog_threat':
      return ['match_winner', 'asian_handicap']
    default:
      return ['custom_unknown']
  }
}

/**
 * Gets candidate markets for a specific alert, extracting patternType from its metadata.
 */
export function getCandidateMarketsForAlert(alertMeta: { patternType?: string; patternName?: string }): OddsMarketType[] {
  let patternType = alertMeta.patternType

  if (!patternType && alertMeta.patternName) {
    const name = alertMeta.patternName.toLowerCase()
    if (name.includes('gol') || name.includes('goal') || name.includes('pressão')) patternType = 'goal_pressure'
    else if (name.includes('escanteio') || name.includes('corner')) patternType = 'corner_pressure'
    else if (name.includes('cartão') || name.includes('card')) patternType = 'card_heat'
    else if (name.includes('reta final') || name.includes('late')) patternType = 'late_goal'
    else if (name.includes('over') || name.includes('acima')) patternType = 'over_trend'
    else if (name.includes('favorito')) patternType = 'favorite_risk'
    else if (name.includes('zebra') || name.includes('underdog')) patternType = 'underdog_threat'
  }

  return inferMarketFromPatternType(patternType || 'custom_unknown')
}
