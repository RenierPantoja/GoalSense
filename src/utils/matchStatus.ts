/**
 * Central match status normalization.
 * Handles all provider status formats.
 */

export type NormalizedStatus = 'scheduled' | 'live' | 'halftime' | 'finished' | 'postponed' | 'cancelled' | 'unknown'

const SCHEDULED = new Set(['SCHEDULED', 'TIMED', 'PRE', 'NS', 'STATUS_SCHEDULED', 'STATUS_PRE_GAME', 'scheduled', 'pre', 'TBD'])
const LIVE = new Set(['LIVE', 'IN_PLAY', 'STATUS_IN_PROGRESS', 'STATUS_FIRST_HALF', 'STATUS_SECOND_HALF', 'in', 'live', '1H', '2H', 'ET', 'BT', 'P'])
const HALFTIME = new Set(['HT', 'HALFTIME', 'STATUS_HALFTIME', 'STATUS_END_PERIOD', 'PAUSED'])
const FINISHED = new Set(['FINISHED', 'FT', 'AET', 'PEN', 'STATUS_FULL_TIME', 'STATUS_FINAL', 'post', 'final', 'AWD', 'WO'])
const POSTPONED = new Set(['POSTPONED', 'PPD', 'PST'])
const CANCELLED = new Set(['CANCELLED', 'CANCELED', 'SUSPENDED', 'CANC', 'ABD'])

export function normalizeMatchStatus(rawStatus?: string, rawState?: string): NormalizedStatus {
  const s = (rawStatus || '').trim()
  const state = (rawState || '').trim()

  // Check state first (ESPN uses state: 'pre'/'in'/'post')
  if (state === 'pre' || SCHEDULED.has(state)) return 'scheduled'
  if (state === 'in' || LIVE.has(state)) return 'live'
  if (state === 'post' || FINISHED.has(state)) return 'finished'

  // Check status
  if (SCHEDULED.has(s)) return 'scheduled'
  if (HALFTIME.has(s)) return 'halftime'
  if (LIVE.has(s)) return 'live'
  if (FINISHED.has(s)) return 'finished'
  if (POSTPONED.has(s)) return 'postponed'
  if (CANCELLED.has(s)) return 'cancelled'

  // Heuristic: if status contains known keywords
  const lower = s.toLowerCase()
  if (lower.includes('schedule') || lower.includes('not started')) return 'scheduled'
  if (lower.includes('progress') || lower.includes('half') || lower.includes('live')) return 'live'
  if (lower.includes('finish') || lower.includes('full time') || lower.includes('ended')) return 'finished'
  if (lower.includes('postpon')) return 'postponed'

  return 'unknown'
}

export function isScheduledMatch(rawStatus?: string, rawState?: string): boolean {
  return normalizeMatchStatus(rawStatus, rawState) === 'scheduled'
}

export function isLiveMatch(rawStatus?: string, rawState?: string): boolean {
  const s = normalizeMatchStatus(rawStatus, rawState)
  return s === 'live' || s === 'halftime'
}

export function isFinishedMatch(rawStatus?: string, rawState?: string): boolean {
  return normalizeMatchStatus(rawStatus, rawState) === 'finished'
}
