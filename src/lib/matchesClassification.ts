/**
 * matchesClassification — single source of truth for match status in /app/matches.
 * ---------------------------------------------------------------------------------
 * Every badge, filter, counter, group header and sidebar in MatchesPage MUST use
 * `classifyMatch()` from this module. No other status logic is allowed.
 *
 * This module combines:
 *   - Provider status normalization (all known status strings)
 *   - Temporal validation (kickoff time vs now)
 *   - A canonical classification object used everywhere
 *
 * No mocks. No invented data. No API calls.
 */

// --- Types ----------------------------------------------------------------

export type MatchCanonicalStatus =
  | 'live'
  | 'halftime'
  | 'finished'
  | 'scheduled'
  | 'starting_soon'
  | 'stale_scheduled'
  | 'delayed'
  | 'cancelled'
  | 'unknown'

export interface MatchClassification {
  canonicalStatus: MatchCanonicalStatus
  isLive: boolean
  isFinished: boolean
  isUpcoming: boolean
  isStartingSoon: boolean
  isStaleScheduled: boolean
  isDelayed: boolean
  isCancelled: boolean
  isUnknown: boolean
  labelShort: string
  labelLong: string
  badgeTone: 'live' | 'finished' | 'upcoming' | 'soon' | 'pending' | 'delayed' | 'cancelled' | 'unknown'
  sortRank: number
}

// --- Status sets (comprehensive, case-insensitive) -------------------------

const FINISHED_STATUSES = new Set([
  'FINISHED', 'FT', 'AET', 'PEN', 'FULL_TIME', 'MATCH FINISHED',
  'FINAL', 'FIM', 'ENCERRADO', 'COMPLETED', 'COMPLETE',
  'POST', 'STATUS_FINAL', 'STATUS_FULL_TIME', 'STATUS_FINAL_PEN',
  'AWD', 'WO', 'GAME OVER',
])

const LIVE_STATUSES = new Set([
  'LIVE', 'IN_PLAY', '1H', '2H', 'ET', 'BT', 'P',
  'STATUS_IN_PROGRESS', 'STATUS_FIRST_HALF', 'STATUS_SECOND_HALF',
  'IN', 'AO VIVO',
])

const HALFTIME_STATUSES = new Set([
  'HT', 'HALFTIME', 'PAUSED', 'STATUS_HALFTIME', 'STATUS_END_PERIOD',
  'INTERVALO', 'BREAK',
])

const SCHEDULED_STATUSES = new Set([
  'TIMED', 'SCHEDULED', 'NS', 'TBD', 'PRE',
  'STATUS_SCHEDULED', 'STATUS_PRE_GAME',
  'NOT STARTED', 'AGENDADO',
])

const DELAYED_STATUSES = new Set([
  'POSTPONED', 'PPD', 'PST', 'DELAYED', 'SUSPENDED', 'SUSP',
  'ADIADO', 'INT',
])

const CANCELLED_STATUSES = new Set([
  'CANCELLED', 'CANCELED', 'CANC', 'ABD', 'ABANDONED',
  'CANCELADO',
])

// --- Temporal constants ---

const STARTING_SOON_MINUTES = 60
const GRACE_MINUTES = 10
const STALE_AFTER_MINUTES = 30

// --- Core classification function -----------------------------------------

export interface MatchInput {
  status: string
  utcDate: string
  state?: string
}

/**
 * Single source of truth. Every UI element in MatchesPage must use this.
 */
export function classifyMatch(match: MatchInput, now: Date = new Date()): MatchClassification {
  const rawStatus = (match.status || '').trim()
  const upper = rawStatus.toUpperCase()
  const state = (match.state || '').trim().toLowerCase()

  // 1. Determine base category from status/state
  let category: 'finished' | 'live' | 'halftime' | 'scheduled' | 'delayed' | 'cancelled' | 'unknown'

  // ESPN state takes highest priority
  if (state === 'post') category = 'finished'
  else if (state === 'in') category = 'live'
  else if (state === 'pre') category = 'scheduled'
  // Then check status string
  else if (FINISHED_STATUSES.has(upper)) category = 'finished'
  else if (HALFTIME_STATUSES.has(upper)) category = 'halftime'
  else if (LIVE_STATUSES.has(upper)) category = 'live'
  else if (SCHEDULED_STATUSES.has(upper)) category = 'scheduled'
  else if (DELAYED_STATUSES.has(upper)) category = 'delayed'
  else if (CANCELLED_STATUSES.has(upper)) category = 'cancelled'
  // Heuristic fallbacks
  else if (upper.includes('FINISH') || upper.includes('FULL TIME') || upper.includes('ENDED') || upper.includes('FINAL')) category = 'finished'
  else if (upper.includes('LIVE') || upper.includes('PROGRESS') || upper.includes('PLAY')) category = 'live'
  else if (upper.includes('SCHEDULE') || upper.includes('NOT STARTED')) category = 'scheduled'
  else if (upper.includes('POSTPON') || upper.includes('DELAY') || upper.includes('SUSPEND')) category = 'delayed'
  else category = 'unknown'

  // 2. For finished/live/halftime — return immediately (no temporal override)
  if (category === 'finished') return buildResult('finished')
  if (category === 'live') return buildResult('live')
  if (category === 'halftime') return buildResult('halftime')
  if (category === 'delayed') return buildResult('delayed')
  if (category === 'cancelled') return buildResult('cancelled')

  // 3. For scheduled/unknown — apply temporal validation
  const kickoff = new Date(match.utcDate)
  const kickoffValid = !isNaN(kickoff.getTime())

  if (!kickoffValid) {
    // No valid date — if status says scheduled, keep as scheduled but flag
    if (category === 'scheduled') return buildResult('scheduled')
    return buildResult('unknown')
  }

  const minutesSinceKickoff = Math.round((now.getTime() - kickoff.getTime()) / 60000)

  // Future kickoff
  if (minutesSinceKickoff < 0) {
    const minutesUntil = Math.abs(minutesSinceKickoff)
    if (minutesUntil <= STARTING_SOON_MINUTES) return buildResult('starting_soon')
    return buildResult('scheduled')
  }

  // Past kickoff with scheduled status
  if (minutesSinceKickoff <= GRACE_MINUTES) {
    // Within grace: could be starting with slight delay
    return buildResult('starting_soon', 'Aguardando início')
  }
  if (minutesSinceKickoff <= STALE_AFTER_MINUTES) {
    return buildResult('stale_scheduled', 'Aguardando atualização')
  }
  // Definitely stale
  return buildResult('stale_scheduled')
}

// --- Result builder -------------------------------------------------------

function buildResult(status: MatchCanonicalStatus, labelOverride?: string): MatchClassification {
  let result: MatchClassification
  switch (status) {
    case 'live':
      result = { canonicalStatus: 'live', isLive: true, isFinished: false, isUpcoming: false, isStartingSoon: false, isStaleScheduled: false, isDelayed: false, isCancelled: false, isUnknown: false, labelShort: 'Ao vivo', labelLong: 'Ao vivo', badgeTone: 'live', sortRank: 500 }; break
    case 'halftime':
      result = { canonicalStatus: 'halftime', isLive: true, isFinished: false, isUpcoming: false, isStartingSoon: false, isStaleScheduled: false, isDelayed: false, isCancelled: false, isUnknown: false, labelShort: 'Intervalo', labelLong: 'Intervalo', badgeTone: 'live', sortRank: 480 }; break
    case 'finished':
      result = { canonicalStatus: 'finished', isLive: false, isFinished: true, isUpcoming: false, isStartingSoon: false, isStaleScheduled: false, isDelayed: false, isCancelled: false, isUnknown: false, labelShort: 'FIM', labelLong: 'Encerrado', badgeTone: 'finished', sortRank: 600 }; break
    case 'scheduled':
      result = { canonicalStatus: 'scheduled', isLive: false, isFinished: false, isUpcoming: true, isStartingSoon: false, isStaleScheduled: false, isDelayed: false, isCancelled: false, isUnknown: false, labelShort: 'Agendado', labelLong: 'Agendado', badgeTone: 'upcoming', sortRank: 300 }; break
    case 'starting_soon':
      result = { canonicalStatus: 'starting_soon', isLive: false, isFinished: false, isUpcoming: true, isStartingSoon: true, isStaleScheduled: false, isDelayed: false, isCancelled: false, isUnknown: false, labelShort: 'Em breve', labelLong: 'Começa em breve', badgeTone: 'soon', sortRank: 400 }; break
    case 'stale_scheduled':
      result = { canonicalStatus: 'stale_scheduled', isLive: false, isFinished: false, isUpcoming: false, isStartingSoon: false, isStaleScheduled: true, isDelayed: false, isCancelled: false, isUnknown: false, labelShort: 'Pendente', labelLong: 'Status pendente', badgeTone: 'pending', sortRank: 200 }; break
    case 'delayed':
      result = { canonicalStatus: 'delayed', isLive: false, isFinished: false, isUpcoming: false, isStartingSoon: false, isStaleScheduled: false, isDelayed: true, isCancelled: false, isUnknown: false, labelShort: 'Adiado', labelLong: 'Adiado', badgeTone: 'delayed', sortRank: 150 }; break
    case 'cancelled':
      result = { canonicalStatus: 'cancelled', isLive: false, isFinished: false, isUpcoming: false, isStartingSoon: false, isStaleScheduled: false, isDelayed: false, isCancelled: true, isUnknown: false, labelShort: 'Cancelado', labelLong: 'Cancelado', badgeTone: 'cancelled', sortRank: 100 }; break
    default:
      result = { canonicalStatus: 'unknown', isLive: false, isFinished: false, isUpcoming: false, isStartingSoon: false, isStaleScheduled: false, isDelayed: false, isCancelled: false, isUnknown: true, labelShort: 'Indefinido', labelLong: 'Status indefinido', badgeTone: 'unknown', sortRank: 0 }; break
  }
  if (labelOverride) { result = { ...result, labelShort: labelOverride, labelLong: labelOverride } }
  return result
}

// --- Status precedence (used by dedupe) -----------------------------------

export function getStatusPrecedence(status: string): number {
  const upper = (status || '').trim().toUpperCase()
  if (FINISHED_STATUSES.has(upper)) return 600
  if (LIVE_STATUSES.has(upper) || HALFTIME_STATUSES.has(upper)) return 500
  if (DELAYED_STATUSES.has(upper)) return 350
  if (SCHEDULED_STATUSES.has(upper)) return 300
  if (CANCELLED_STATUSES.has(upper)) return 150
  // Heuristic
  if (upper.includes('FINISH') || upper.includes('FINAL') || upper.includes('FULL TIME')) return 600
  if (upper.includes('LIVE') || upper.includes('PLAY')) return 500
  return 0
}
