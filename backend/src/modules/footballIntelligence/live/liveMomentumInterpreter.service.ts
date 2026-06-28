import type { CanonicalLiveSnapshot } from './espnLiveSnapshotNormalizer.service.js'

export interface LiveMomentumAssessment {
  fixtureId: string
  generatedAt: string
  momentumSide: 'home' | 'away' | 'balanced' | 'unclear'
  momentumStrength: 'high' | 'medium' | 'low' | 'unknown'
  pressureSignals: string[]
  riskSignals: string[]
  gameStateSignals: string[]
  recentShift: string
  confidenceOfAssessment: 'high' | 'medium' | 'low'
  limitations: string[]
}

export function interpretLiveMomentum(
  currentSnapshot: CanonicalLiveSnapshot,
  previousSnapshot?: CanonicalLiveSnapshot
): LiveMomentumAssessment {
  const pressureSignals: string[] = []
  const riskSignals: string[] = []
  const gameStateSignals: string[] = []
  const limitations: string[] = []

  if (currentSnapshot.missingFields.length > 0) {
    limitations.push('Stats unavailable or partial. Momentum uses limited signals.')
  }

  // Basic rules
  if (currentSnapshot.stats?.redCards?.home && currentSnapshot.stats.redCards.home > 0) {
    riskSignals.push('red_card_home')
  }
  if (currentSnapshot.stats?.redCards?.away && currentSnapshot.stats.redCards.away > 0) {
    riskSignals.push('red_card_away')
  }

  let momentumSide: 'home' | 'away' | 'balanced' | 'unclear' = 'unclear'
  let momentumStrength: 'high' | 'medium' | 'low' | 'unknown' = 'unknown'

  // Very rudimentary possession pressure check
  const homePossession = currentSnapshot.stats?.possession?.home ?? 50
  if (homePossession > 65) {
    momentumSide = 'home'
    momentumStrength = 'medium'
    pressureSignals.push('possession_pressure_home')
  } else if (homePossession < 35) {
    momentumSide = 'away'
    momentumStrength = 'medium'
    pressureSignals.push('possession_pressure_away')
  } else {
    momentumSide = 'balanced'
    momentumStrength = 'low'
  }

  if (currentSnapshot.minute && currentSnapshot.minute > 75) {
    gameStateSignals.push('late_game_urgency')
  }

  return {
    fixtureId: currentSnapshot.fixtureId,
    generatedAt: new Date().toISOString(),
    momentumSide,
    momentumStrength,
    pressureSignals,
    riskSignals,
    gameStateSignals,
    recentShift: previousSnapshot ? 'stable' : 'no_trend_baseline',
    confidenceOfAssessment: currentSnapshot.dataQuality === 'high' ? 'medium' : 'low', // Never high, it's live interpretation
    limitations
  }
}
