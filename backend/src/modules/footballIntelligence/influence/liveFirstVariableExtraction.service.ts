/**
 * Live-First Variable Extraction — B57 Real-Time Variable Mining
 * ─────────────────────────────────────────────────────────────────────────────
 * Extracts variables from live ESPN data for influence assessment.
 * Only uses available data, never invents missing information.
 */

interface LiveFirstVariables {
  // Core match state
  minute?: number
  status?: string
  scoreHome?: number
  scoreAway?: number
  goalDifference?: number
  isLead?: boolean
  leadingTeam?: 'home' | 'away' | 'none'

  // Stats-based (when available)
  possessionHome?: number
  possessionAway?: number
  possessionDifference?: number
  possessionDominance?: 'home' | 'away' | 'balanced'

  shotsHome?: number
  shotsAway?: number
  shotsDifference?: number
  shotsAdvantage?: 'home' | 'away' | 'balanced'

  shotsOnTargetHome?: number
  shotsOnTargetAway?: number
  shotAccuracyHome?: number
  shotAccuracyAway?: number

  cornersHome?: number
  cornersAway?: number
  cornersDifference?: number

  foulsHome?: number
  foulsAway?: number
  foulsDifference?: number

  yellowCardsHome?: number
  yellowCardsAway?: number
  redCardsHome?: number
  redCardsAway?: number
  cardsDifference?: number

  // Derived variables
  matchPhase?: 'early' | 'mid' | 'late' | 'extra'
  pressureIndex?: number
  momentumDirection?: 'home' | 'away' | 'neutral'
  gameState?: 'open' | 'controlled' | 'defensive' | 'chaotic'

  // Data availability flags
  hasStats?: boolean
  hasEvents?: boolean
  dataCompleteness?: number
}

/**
 * Extract live-first variables from normalized snapshot and enriched data
 */
export async function extractLiveFirstVariables(
  normalizedSnapshot: any,
  stats?: any,
  events?: any[]
): Promise<LiveFirstVariables> {
  const vars: LiveFirstVariables = {}

  try {
    // Core match state variables
    if (normalizedSnapshot.minute !== undefined) {
      vars.minute = normalizedSnapshot.minute
      vars.matchPhase = determineMatchPhase(normalizedSnapshot.minute, normalizedSnapshot.status)
    }

    if (normalizedSnapshot.status) {
      vars.status = normalizedSnapshot.status
    }

    // Score variables
    if (normalizedSnapshot.score) {
      vars.scoreHome = normalizedSnapshot.score.home || 0
      vars.scoreAway = normalizedSnapshot.score.away || 0
      vars.goalDifference = (vars.scoreHome || 0) - (vars.scoreAway || 0)
      vars.isLead = Math.abs(vars.goalDifference) > 0

      if (vars.goalDifference > 0) vars.leadingTeam = 'home'
      else if (vars.goalDifference < 0) vars.leadingTeam = 'away'
      else vars.leadingTeam = 'none'
    }

    // Stats-based variables (if available)
    if (stats) {
      vars.hasStats = true

      // Possession
      if (stats.possessionHome !== undefined && stats.possessionAway !== undefined) {
        vars.possessionHome = stats.possessionHome
        vars.possessionAway = stats.possessionAway
        vars.possessionDifference = stats.possessionHome - stats.possessionAway

        if (Math.abs(vars.possessionDifference) >= 15) {
          vars.possessionDominance = vars.possessionDifference > 0 ? 'home' : 'away'
        } else {
          vars.possessionDominance = 'balanced'
        }
      }

      // Shots
      if (stats.shotsHome !== undefined && stats.shotsAway !== undefined) {
        vars.shotsHome = stats.shotsHome
        vars.shotsAway = stats.shotsAway
        vars.shotsDifference = stats.shotsHome - stats.shotsAway

        if (Math.abs(vars.shotsDifference) >= 3) {
          vars.shotsAdvantage = vars.shotsDifference > 0 ? 'home' : 'away'
        } else {
          vars.shotsAdvantage = 'balanced'
        }
      }

      // Shots on target & accuracy
      if (stats.shotsOnTargetHome !== undefined) {
        vars.shotsOnTargetHome = stats.shotsOnTargetHome
        if (vars.shotsHome && vars.shotsHome > 0) {
          vars.shotAccuracyHome = (vars.shotsOnTargetHome || 0) / vars.shotsHome
        }
      }
      if (stats.shotsOnTargetAway !== undefined) {
        vars.shotsOnTargetAway = stats.shotsOnTargetAway
        if (vars.shotsAway && vars.shotsAway > 0) {
          vars.shotAccuracyAway = (vars.shotsOnTargetAway || 0) / vars.shotsAway
        }
      }

      // Corners
      if (stats.cornersHome !== undefined && stats.cornersAway !== undefined) {
        vars.cornersHome = stats.cornersHome
        vars.cornersAway = stats.cornersAway
        vars.cornersDifference = stats.cornersHome - stats.cornersAway
      }

      // Fouls
      if (stats.foulsHome !== undefined && stats.foulsAway !== undefined) {
        vars.foulsHome = stats.foulsHome
        vars.foulsAway = stats.foulsAway
        vars.foulsDifference = stats.foulsHome - stats.foulsAway
      }

      // Cards
      if (stats.yellowCardsHome !== undefined) vars.yellowCardsHome = stats.yellowCardsHome
      if (stats.yellowCardsAway !== undefined) vars.yellowCardsAway = stats.yellowCardsAway
      if (stats.redCardsHome !== undefined) vars.redCardsHome = stats.redCardsHome
      if (stats.redCardsAway !== undefined) vars.redCardsAway = stats.redCardsAway

      if (vars.yellowCardsHome !== undefined && vars.yellowCardsAway !== undefined &&
          vars.redCardsHome !== undefined && vars.redCardsAway !== undefined) {
        const homeCards = vars.yellowCardsHome + (vars.redCardsHome * 2)
        const awayCards = vars.yellowCardsAway + (vars.redCardsAway * 2)
        vars.cardsDifference = homeCards - awayCards
      }
    }

    // Event-based variables
    if (events && Array.isArray(events) && events.length > 0) {
      vars.hasEvents = true

      // Enhanced momentum from recent events
      const recentEvents = events.filter(e => {
        const eventMinute = e.minute || 0
        const currentMinute = vars.minute || 90
        return eventMinute >= currentMinute - 10 // Last 10 minutes
      })

      const homeRecentGoals = recentEvents.filter(e =>
        e.type === 'goal' && e.side === 'home'
      ).length
      const awayRecentGoals = recentEvents.filter(e =>
        e.type === 'goal' && e.side === 'away'
      ).length

      if (homeRecentGoals > awayRecentGoals) vars.momentumDirection = 'home'
      else if (awayRecentGoals > homeRecentGoals) vars.momentumDirection = 'away'
      else vars.momentumDirection = 'neutral'
    }

    // Derived composite variables
    vars.pressureIndex = calculatePressureIndex(vars)
    vars.gameState = determineGameState(vars)

    // Data completeness
    vars.dataCompleteness = calculateDataCompleteness(vars)

    return vars

  } catch (error: any) {
    return {
      hasStats: false,
      hasEvents: false,
      dataCompleteness: 0
    }
  }
}

function determineMatchPhase(minute: number, status: string): 'early' | 'mid' | 'late' | 'extra' {
  if (status === 'ET' || status === 'P') return 'extra'
  if (minute <= 20) return 'early'
  if (minute <= 70) return 'mid'
  return 'late'
}

function calculatePressureIndex(vars: LiveFirstVariables): number {
  let pressure = 0
  let factors = 0

  // Shot pressure
  if (vars.shotsOnTargetHome !== undefined && vars.shotsOnTargetAway !== undefined) {
    const totalShots = vars.shotsOnTargetHome + vars.shotsOnTargetAway
    pressure += totalShots * 0.1
    factors++
  }

  // Corner pressure
  if (vars.cornersDifference !== undefined) {
    pressure += Math.abs(vars.cornersDifference) * 0.05
    factors++
  }

  // Card pressure (indicates intensity)
  if (vars.cardsDifference !== undefined) {
    pressure += Math.abs(vars.cardsDifference) * 0.1
    factors++
  }

  // Time pressure (late game)
  if (vars.matchPhase === 'late' || vars.matchPhase === 'extra') {
    pressure += 0.2
    factors++
  }

  return factors > 0 ? pressure / factors : 0
}

function determineGameState(vars: LiveFirstVariables): 'open' | 'controlled' | 'defensive' | 'chaotic' {
  // Chaotic: lots of cards, fouls, or shots
  if (vars.cardsDifference !== undefined && Math.abs(vars.cardsDifference) >= 3) return 'chaotic'
  if (vars.foulsDifference !== undefined && Math.abs(vars.foulsDifference) >= 8) return 'chaotic'

  // Controlled: possession dominance with limited opponent chances
  if (vars.possessionDominance && vars.possessionDominance !== 'balanced') {
    if (vars.shotsAdvantage === vars.possessionDominance) return 'controlled'
  }

  // Defensive: low shots, low possession for losing team
  if (vars.isLead && vars.shotsHome !== undefined && vars.shotsAway !== undefined) {
    const totalShots = vars.shotsHome + vars.shotsAway
    if (totalShots < 6) return 'defensive'
  }

  return 'open'
}

function calculateDataCompleteness(vars: LiveFirstVariables): number {
  const possibleFields = [
    'minute', 'status', 'scoreHome', 'scoreAway', 'possessionHome', 'possessionAway',
    'shotsHome', 'shotsAway', 'shotsOnTargetHome', 'shotsOnTargetAway',
    'cornersHome', 'cornersAway', 'foulsHome', 'foulsAway',
    'yellowCardsHome', 'yellowCardsAway', 'redCardsHome', 'redCardsAway'
  ]

  const availableFields = possibleFields.filter(field => vars[field as keyof LiveFirstVariables] !== undefined)

  return availableFields.length / possibleFields.length
}