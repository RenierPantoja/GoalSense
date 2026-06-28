/**
 * Live Momentum Interpreter — B57 Real-Time Momentum Analysis
 * ─────────────────────────────────────────────────────────────────────────────
 * Interprets live match momentum from ESPN data. Never invents data.
 */
import type { LiveSnapshotDiff } from '../../footballIntelligence/live/liveMonitoringSession.types.js'

interface MomentumResult {
  confidence: number
  direction: 'home' | 'away' | 'neutral'
  intensity: 'high' | 'medium' | 'low'
  factors: string[]
  limitations: string[]
}

/**
 * Interpret momentum from normalized live snapshot
 */
export async function interpretLiveMomentum(
  normalizedSnapshot: any,
  diff?: LiveSnapshotDiff | null
): Promise<MomentumResult> {
  const factors: string[] = []
  const limitations: string[] = []
  let confidence = 0.1 // Start very low
  let direction: 'home' | 'away' | 'neutral' = 'neutral'
  let intensity: 'high' | 'medium' | 'low' = 'low'

  try {
    // Score-based momentum
    const homeScore = normalizedSnapshot.score?.home || 0
    const awayScore = normalizedSnapshot.score?.away || 0

    if (homeScore > awayScore) {
      direction = 'home'
      factors.push(`Leading ${homeScore}-${awayScore}`)
      confidence += 0.2
    } else if (awayScore > homeScore) {
      direction = 'away'
      factors.push(`Leading ${awayScore}-${homeScore}`)
      confidence += 0.2
    }

    // Recent goal momentum from diff
    if (diff?.detectedChanges.includes('goal_home')) {
      direction = 'home'
      factors.push('Recent home goal')
      confidence += 0.3
      intensity = 'high'
    } else if (diff?.detectedChanges.includes('goal_away')) {
      direction = 'away'
      factors.push('Recent away goal')
      confidence += 0.3
      intensity = 'high'
    }

    // Stats-based momentum (if available)
    const stats = normalizedSnapshot.stats || {}
    if (stats.possessionHome && stats.possessionAway) {
      const homePoss = stats.possessionHome
      const awayPoss = stats.possessionAway

      if (homePoss > 60) {
        factors.push(`Home possession dominance (${homePoss}%)`)
        confidence += 0.15
        if (direction === 'neutral') direction = 'home'
      } else if (awayPoss > 60) {
        factors.push(`Away possession dominance (${awayPoss}%)`)
        confidence += 0.15
        if (direction === 'neutral') direction = 'away'
      }
    } else {
      limitations.push('No possession data available')
    }

    // Shots momentum
    if (stats.shotsOnTargetHome && stats.shotsOnTargetAway) {
      const homeSot = stats.shotsOnTargetHome
      const awaySot = stats.shotsOnTargetAway

      if (homeSot > awaySot + 2) {
        factors.push(`Home shots advantage (${homeSot} vs ${awaySot})`)
        confidence += 0.1
        if (direction === 'neutral') direction = 'home'
      } else if (awaySot > homeSot + 2) {
        factors.push(`Away shots advantage (${awaySot} vs ${homeSot})`)
        confidence += 0.1
        if (direction === 'neutral') direction = 'away'
      }
    }

    // Red card impact
    if (diff?.detectedChanges.includes('red_card_home')) {
      direction = 'away'
      factors.push('Home red card disadvantage')
      confidence += 0.2
      intensity = 'medium'
    } else if (diff?.detectedChanges.includes('red_card_away')) {
      direction = 'home'
      factors.push('Away red card disadvantage')
      confidence += 0.2
      intensity = 'medium'
    }

    // Match phase momentum
    const minute = normalizedSnapshot.minute
    if (minute) {
      if (minute < 15 && (homeScore > 0 || awayScore > 0)) {
        factors.push('Early goal momentum')
        confidence += 0.1
        intensity = intensity === 'low' ? 'medium' : intensity
      }

      if (minute > 75 && diff?.detectedChanges.includes('score_changed')) {
        factors.push('Late game momentum shift')
        confidence += 0.15
        intensity = 'high'
      }
    }

    // Data quality impact on confidence
    const dataQuality = normalizedSnapshot.dataQuality
    if (dataQuality === 'poor') {
      confidence *= 0.7
      limitations.push('Limited data quality affects confidence')
    } else if (dataQuality === 'rich') {
      confidence *= 1.1 // Small boost for rich data
    }

    // General limitations
    if (!diff) {
      limitations.push('No previous snapshot for momentum comparison')
      confidence *= 0.8
    }

    if (factors.length === 0) {
      factors.push('No clear momentum indicators')
      confidence = 0.1
    }

    if (!stats.possessionHome && !stats.shotsHome) {
      limitations.push('Missing key stats for momentum analysis')
      confidence *= 0.6
    }

    // Cap confidence
    confidence = Math.min(confidence, 1.0)

    return {
      confidence,
      direction,
      intensity,
      factors,
      limitations
    }

  } catch (error: any) {
    return {
      confidence: 0.1,
      direction: 'neutral',
      intensity: 'low',
      factors: [],
      limitations: [`Momentum analysis failed: ${error?.message || 'unknown'}`]
    }
  }
}