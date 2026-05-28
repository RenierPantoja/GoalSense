/**
 * MomentumWindowEngine — validates recency of offensive signals.
 * ---------------------------------------------------------------------------------
 * Patterns like "Pressão por gol" or "Reta final perigosa" must not fire based
 * solely on accumulated stats. This engine checks whether offensive activity
 * is happening NOW (within a configurable time window).
 *
 * Data sources (in priority order):
 *   1. Timed events from the provider (events with minute)
 *   2. Stats comparison (if we had previous snapshot — future)
 *   3. Current stats as weak proxy (penalized confidence)
 *
 * No mocks. No invented events. No fake recency.
 */

import type { LiveFixture } from '@/lib/apiClient'
import type { FixtureStatsForPattern, Pattern } from '../types/commandTypes'

// --- Types ----------------------------------------------------------------

export interface MomentumWindowResult {
  windowMinutes: number
  currentMinute: number | null
  side: 'home' | 'away' | 'balanced' | 'unknown'
  strength: number // 0-100
  trend: 'rising' | 'stable' | 'falling' | 'unknown'
  confidence: number // how confident we are in this momentum reading
  hasRecentActivity: boolean
  /** Source of momentum data — determines confidence caps. */
  momentumSource: 'timed_events' | 'mixed' | 'stats_proxy' | 'insufficient'
  /** How confident we are that the activity is RECENT (not just accumulated). */
  recencyConfidence: number
  explanation: string
  blockers: string[]
  dataQuality: {
    hasTimedEvents: boolean
    hasStats: boolean
    hasRecentProxy: boolean
    missing: string[]
  }
}

// --- Pattern momentum requirements ----------------------------------------

const OFFENSIVE_PATTERN_KEYWORDS = [
  'pressão', 'pressure', 'gol', 'goal', 'over', 'reta final', 'final phase',
  'tardio', 'late', 'domínio', 'dominance', 'pressionando', 'pressing',
  'visitante perigoso', 'dangerous away', 'jogo aberto', 'open',
  'escanteio', 'corner', 'segundo tempo quente', 'hot second',
  'ruptura', 'locked',
]

/**
 * Determines if a pattern requires momentum validation.
 */
export function patternRequiresMomentum(pattern: Pattern): boolean {
  const name = pattern.name.toLowerCase()
  const desc = (pattern.description || '').toLowerCase()
  const text = `${name} ${desc}`
  return OFFENSIVE_PATTERN_KEYWORDS.some(kw => text.includes(kw))
}

/**
 * Get the appropriate momentum window (in minutes) for a pattern.
 */
export function getMomentumWindowForPattern(pattern: Pattern): number {
  const name = pattern.name.toLowerCase()
  if (name.includes('reta final') || name.includes('tardio') || name.includes('late')) return 8
  if (name.includes('pressão') || name.includes('pressure') || name.includes('visitante')) return 10
  if (name.includes('escanteio') || name.includes('corner') || name.includes('cartão') || name.includes('card')) return 15
  return 12 // default
}

// --- Main engine ----------------------------------------------------------

/**
 * Build a momentum window assessment for a fixture.
 * Uses stats as a proxy for recency when timed events are unavailable.
 */
export function buildMomentumWindow(
  fixture: LiveFixture,
  stats: FixtureStatsForPattern | undefined,
  windowMinutes: number = 10,
): MomentumWindowResult {
  const elapsed = fixture.status.elapsed || 0
  const blockers: string[] = []
  const missing: string[] = []

  // Without stats, we can't assess momentum at all
  if (!stats) {
    return {
      windowMinutes,
      currentMinute: elapsed || null,
      side: 'unknown',
      strength: 0,
      trend: 'unknown',
      confidence: 0,
      hasRecentActivity: false,
      momentumSource: 'insufficient',
      recencyConfidence: 0,
      explanation: 'Sem dados estatísticos disponíveis',
      blockers: ['Provider não entregou estatísticas'],
      dataQuality: { hasTimedEvents: false, hasStats: false, hasRecentProxy: false, missing: ['stats'] },
    }
  }

  // We don't have timed events in the current architecture (stats are aggregated).
  // Use stats volume as a PROXY for activity level, with reduced confidence.
  const hasStats = true
  const hasTimedEvents = false // Future: integrate with normalizeEvents when available

  if (!stats.shots && !stats.shotsOnTarget && !stats.corners) {
    missing.push('shots', 'shotsOnTarget', 'corners')
    return {
      windowMinutes,
      currentMinute: elapsed || null,
      side: 'unknown',
      strength: 0,
      trend: 'unknown',
      confidence: 15,
      hasRecentActivity: false,
      momentumSource: 'insufficient',
      recencyConfidence: 5,
      explanation: 'Estatísticas ofensivas indisponíveis',
      blockers: ['Sem dados de finalizações ou escanteios'],
      dataQuality: { hasTimedEvents: false, hasStats: true, hasRecentProxy: false, missing },
    }
  }

  // Compute activity proxy from accumulated stats
  const totalShots = (stats.shots?.home || 0) + (stats.shots?.away || 0)
  const totalSOT = (stats.shotsOnTarget?.home || 0) + (stats.shotsOnTarget?.away || 0)
  const totalCorners = (stats.corners?.home || 0) + (stats.corners?.away || 0)
  const homeShots = stats.shots?.home || 0
  const awayShots = stats.shots?.away || 0
  const homeSOT = stats.shotsOnTarget?.home || 0
  const awaySOT = stats.shotsOnTarget?.away || 0
  const homeCorners = stats.corners?.home || 0
  const awayCorners = stats.corners?.away || 0
  const homePoss = stats.possession?.home || 0
  const awayPoss = stats.possession?.away || 0

  // Determine dominant side
  const homeOffensive = homeShots * 1.0 + homeSOT * 2.0 + homeCorners * 0.8
  const awayOffensive = awayShots * 1.0 + awaySOT * 2.0 + awayCorners * 0.8
  const side: MomentumWindowResult['side'] =
    homeOffensive > awayOffensive * 1.3 ? 'home' :
    awayOffensive > homeOffensive * 1.3 ? 'away' :
    (homeOffensive > 0 || awayOffensive > 0) ? 'balanced' : 'unknown'

  // Strength: based on volume relative to elapsed time
  // A "strong" game has ~1 shot per 5 minutes, ~1 SOT per 10 min, ~1 corner per 8 min
  const expectedShots = Math.max(1, elapsed / 5)
  const expectedSOT = Math.max(1, elapsed / 10)
  const expectedCorners = Math.max(1, elapsed / 8)
  const shotRatio = Math.min(1.5, totalShots / expectedShots)
  const sotRatio = Math.min(1.5, totalSOT / expectedSOT)
  const cornerRatio = Math.min(1.5, totalCorners / expectedCorners)
  const rawStrength = Math.round(((shotRatio + sotRatio * 1.5 + cornerRatio * 0.8) / 3.3) * 100)
  const strength = Math.min(100, Math.max(0, rawStrength))

  // Trend: without timed events, we can only infer from volume vs time
  // High volume in late game = likely still active. Low volume late = falling.
  let trend: MomentumWindowResult['trend'] = 'unknown'
  if (elapsed >= 60) {
    const shotsPerMin = totalShots / Math.max(1, elapsed)
    if (shotsPerMin >= 0.2 && totalSOT >= 4) trend = 'rising'
    else if (shotsPerMin >= 0.12) trend = 'stable'
    else trend = 'falling'
  } else if (elapsed >= 30) {
    trend = totalShots >= 6 ? 'stable' : 'falling'
  }

  // Detect sterile possession: high possession but low shots
  const maxPoss = Math.max(homePoss, awayPoss)
  const isSterilePossession = maxPoss >= 60 && totalSOT <= 2 && elapsed >= 40

  if (isSterilePossession) {
    blockers.push('Posse alta sem agressividade ofensiva')
    trend = 'falling'
  }

  // Confidence: reduced because we're using aggregated stats, not timed events
  // Base 50 (proxy), boosted by volume, penalized by missing data
  let confidence = 50
  if (totalSOT >= 4) confidence += 15
  if (totalShots >= 8) confidence += 10
  if (totalCorners >= 5) confidence += 5
  if (isSterilePossession) confidence -= 20
  if (trend === 'falling') confidence -= 10
  if (trend === 'rising') confidence += 10
  confidence = Math.max(10, Math.min(85, confidence))

  // Has recent activity: proxy — if volume is high relative to time, assume yes
  const hasRecentActivity = strength >= 45 && trend !== 'falling' && !isSterilePossession

  // Explanation
  let explanation: string
  if (hasRecentActivity) {
    explanation = `Volume ofensivo ${strength >= 70 ? 'alto' : 'moderado'}: ${totalShots} fin., ${totalSOT} no alvo, ${totalCorners} esc.`
  } else if (isSterilePossession) {
    explanation = `Posse ${maxPoss}% sem conversão ofensiva (${totalSOT} no alvo em ${elapsed}')`
  } else if (trend === 'falling') {
    explanation = `Atividade ofensiva baixa: ${totalShots} fin. em ${elapsed}' (${(totalShots / Math.max(1, elapsed) * 10).toFixed(1)}/10min)`
  } else {
    explanation = `Dados agregados: ${totalShots} fin., ${totalSOT} no alvo em ${elapsed}'`
  }

  if (!hasTimedEvents) {
    blockers.push('Sem eventos com minuto — usando estatísticas agregadas como proxy')
  }

  // Determine momentum source and recency confidence
  const momentumSource: MomentumWindowResult['momentumSource'] = hasTimedEvents
    ? (hasStats ? 'mixed' : 'timed_events')
    : (hasStats && strength > 0 ? 'stats_proxy' : 'insufficient')

  // Recency confidence: how sure we are this is happening NOW
  // Without timed events, recency is always uncertain
  let recencyConfidence: number
  if (hasTimedEvents) {
    recencyConfidence = Math.min(95, confidence + 10)
  } else if (hasRecentActivity && trend === 'rising') {
    recencyConfidence = Math.min(65, confidence - 5)
  } else if (hasRecentActivity) {
    recencyConfidence = Math.min(55, confidence - 10)
  } else {
    recencyConfidence = Math.min(40, confidence - 15)
  }
  recencyConfidence = Math.max(0, recencyConfidence)

  return {
    windowMinutes,
    currentMinute: elapsed || null,
    side,
    strength,
    trend,
    confidence,
    hasRecentActivity,
    momentumSource,
    recencyConfidence,
    explanation,
    blockers,
    dataQuality: { hasTimedEvents, hasStats, hasRecentProxy: hasRecentActivity, missing },
  }
}

/**
 * Apply momentum penalty/bonus to a confidence score.
 * Returns the adjustment (positive = bonus, negative = penalty).
 */
export function getMomentumAdjustment(momentum: MomentumWindowResult, patternName: string): { adjustment: number; reason: string | null } {
  if (momentum.confidence === 0) {
    return { adjustment: -10, reason: 'Sem dados de momentum' }
  }

  if (!momentum.hasRecentActivity && momentum.trend === 'falling') {
    return { adjustment: -15, reason: 'Pressão antiga sem atividade recente' }
  }

  if (momentum.blockers.some(b => b.includes('Posse alta sem agressividade'))) {
    return { adjustment: -12, reason: 'Posse estéril sem finalizações' }
  }

  if (!momentum.hasRecentActivity) {
    return { adjustment: -8, reason: 'Volume ofensivo insuficiente para o momento' }
  }

  if (momentum.trend === 'rising' && momentum.strength >= 65) {
    return { adjustment: 8, reason: 'Pressão ofensiva crescente' }
  }

  if (momentum.hasRecentActivity && momentum.strength >= 50) {
    return { adjustment: 4, reason: 'Atividade ofensiva presente' }
  }

  return { adjustment: 0, reason: null }
}
