/**
 * Backend Momentum Service — evaluates offensive pressure from timed events.
 * Same philosophy as frontend: timed_events > stats_proxy > insufficient.
 */
import type { BackendTimedEvent } from '../../providers/espn.provider.js'
import type { PatternEvaluationInput } from './snapshotToPatternInput.js'

export interface MomentumResult {
  momentumSource: 'timed_events' | 'mixed' | 'stats_proxy' | 'insufficient'
  recencyConfidence: number // 0-100
  recentEventsUsed: BackendTimedEvent[]
  strength: 'strong' | 'moderate' | 'weak' | 'none'
  blockers: string[]
}

const OFFENSIVE_TYPES = new Set([
  'goal', 'own_goal', 'penalty_scored', 'shot_on_target', 'shot_off_target',
  'corner', 'dangerous_attack',
])

const WINDOW_MINUTES = 10

export function evaluateMomentum(input: PatternEvaluationInput, side?: 'home' | 'away'): MomentumResult {
  const blockers: string[] = []

  if (input.minute == null) {
    return { momentumSource: 'insufficient', recencyConfidence: 0, recentEventsUsed: [], strength: 'none', blockers: ['No minute available'] }
  }

  const events = input.events
  if (!events || events.length === 0) {
    // Fall back to stats proxy
    if (input.stats && (input.stats.shotsOnTargetHome !== undefined || input.stats.shotsHome !== undefined)) {
      return { momentumSource: 'stats_proxy', recencyConfidence: 35, recentEventsUsed: [], strength: 'weak', blockers: ['No timed events, using stats proxy'] }
    }
    return { momentumSource: 'insufficient', recencyConfidence: 0, recentEventsUsed: [], strength: 'none', blockers: ['No events and no stats'] }
  }

  // Filter recent offensive events within window
  const windowStart = input.minute - WINDOW_MINUTES
  const currentMinute = input.minute
  const recentAll = events.filter(e => e.minute >= windowStart && e.minute <= currentMinute)
  const recentOffensive = recentAll.filter(e => OFFENSIVE_TYPES.has(e.type))

  // Filter by side if specified
  const relevant = side
    ? recentOffensive.filter(e => e.side === side)
    : recentOffensive

  const count = relevant.length

  // Determine strength
  let strength: MomentumResult['strength'] = 'none'
  if (count >= 4) strength = 'strong'
  else if (count >= 2) strength = 'moderate'
  else if (count >= 1) strength = 'weak'

  // Recency confidence
  let recencyConfidence = 0
  if (count >= 4) recencyConfidence = 85
  else if (count >= 2) recencyConfidence = 65
  else if (count >= 1) recencyConfidence = 45
  else recencyConfidence = 20

  // Determine source
  let momentumSource: MomentumResult['momentumSource'] = 'timed_events'
  if (count === 0 && input.stats) {
    momentumSource = 'stats_proxy'
    recencyConfidence = 35
  } else if (count === 0) {
    momentumSource = 'insufficient'
    recencyConfidence = 0
  }

  return {
    momentumSource,
    recencyConfidence,
    recentEventsUsed: relevant.slice(0, 5),
    strength,
    blockers,
  }
}
