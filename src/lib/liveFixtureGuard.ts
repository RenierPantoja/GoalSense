/**
 * liveFixtureGuard — central validation that a fixture is truly live RIGHT NOW.
 * -----------------------------------------------------------------------------
 * Problem: providers can return stale fixtures (yesterday's match with status
 * still marked as "in progress" due to caching, suspended matches from days
 * ago, etc.). The /app/live page must NEVER show a match that isn't actually
 * happening right now.
 *
 * This module provides:
 *   - `isTrulyLiveFixture(fixture, now?)` — boolean gate
 *   - `getLiveFixtureValidation(fixture, now?)` — detailed validation result
 *
 * Rules:
 *   - Status must be a recognized live status (1H, 2H, HT, ET, LIVE, etc.)
 *   - Fixture date must be within a reasonable time window of "now"
 *   - Matches older than 5 hours are rejected even if status says live
 *   - Matches more than 1 hour in the future are rejected
 *   - Unknown/empty status is never treated as live
 *   - FT/AET/PEN (finished) are always rejected
 *
 * No mocks. No invented data. No API calls.
 */

import type { LiveFixture } from './apiClient'

// --- Types ----------------------------------------------------------------

export interface LiveFixtureValidation {
  isLive: boolean
  reasons: string[]
  statusNormalized: 'live' | 'halftime' | 'extra_time' | 'penalties' | 'suspended' | 'finished' | 'scheduled' | 'unknown'
  dateDistanceHours: number | null
}

// --- Status sets ----------------------------------------------------------

const LIVE_STATUSES = new Set([
  'LIVE', '1H', '2H', 'ET', 'BT', 'P',
  'IN_PLAY', 'IN_PROGRESS',
  'STATUS_IN_PROGRESS', 'STATUS_FIRST_HALF', 'STATUS_SECOND_HALF',
])

const HALFTIME_STATUSES = new Set([
  'HT', 'HALFTIME', 'PAUSED', 'STATUS_HALFTIME', 'STATUS_END_PERIOD',
])

const EXTRA_TIME_STATUSES = new Set(['ET', 'BT', 'P'])

const FINISHED_STATUSES = new Set([
  'FT', 'AET', 'PEN', 'AWD', 'WO',
  'FINISHED', 'STATUS_FULL_TIME', 'STATUS_FINAL',
  'FULL_TIME', 'Match Finished',
])

const SUSPENDED_STATUSES = new Set(['SUSP', 'INT', 'SUSPENDED', 'INTERRUPTED'])

const SCHEDULED_STATUSES = new Set(['NS', 'TBD', 'SCHEDULED', 'TIMED', 'PRE', 'STATUS_SCHEDULED', 'STATUS_PRE_GAME'])

// --- Time window constants ------------------------------------------------

/** Maximum hours since kickoff for a match to still be considered live. */
const MAX_HOURS_SINCE_KICKOFF = 5

/** Maximum hours in the future for a match to be considered live (handles
 *  timezone edge cases where a match starts "tomorrow" in UTC but is today
 *  locally). */
const MAX_HOURS_AHEAD = 1

// --- Helpers --------------------------------------------------------------

function parseFixtureDateSafe(dateStr: string | undefined | null): Date | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  return d
}

function getHoursFromNow(fixtureDate: Date, now: Date): number {
  return (now.getTime() - fixtureDate.getTime()) / (1000 * 60 * 60)
}

function normalizeStatusCategory(
  statusShort: string,
  statusState?: string,
  raw?: string,
): LiveFixtureValidation['statusNormalized'] {
  const s = (statusShort || '').trim().toUpperCase()
  const state = (statusState || '').trim().toLowerCase()
  const rawUpper = (raw || '').toUpperCase()

  // ESPN state takes priority
  if (state === 'post') return 'finished'
  if (state === 'pre') return 'scheduled'
  if (state === 'in') return 'live'

  if (FINISHED_STATUSES.has(s) || rawUpper.includes('FULL_TIME') || rawUpper.includes('FINISHED')) return 'finished'
  if (SCHEDULED_STATUSES.has(s)) return 'scheduled'
  if (HALFTIME_STATUSES.has(s)) return 'halftime'
  if (EXTRA_TIME_STATUSES.has(s)) return 'extra_time'
  if (SUSPENDED_STATUSES.has(s)) return 'suspended'
  if (LIVE_STATUSES.has(s)) return 'live'

  // Heuristic fallbacks
  const lower = s.toLowerCase()
  if (lower.includes('live') || lower.includes('progress') || lower.includes('half')) return 'live'
  if (lower.includes('finish') || lower.includes('full time') || lower.includes('ended')) return 'finished'

  return 'unknown'
}

// --- Public API -----------------------------------------------------------

/**
 * Returns true only if the fixture is genuinely live right now.
 * Use this as the primary gate for /app/live.
 */
export function isTrulyLiveFixture(fixture: LiveFixture, now: Date = new Date()): boolean {
  return getLiveFixtureValidation(fixture, now).isLive
}

/**
 * Detailed validation with reasons (useful for debugging/diagnostics).
 */
export function getLiveFixtureValidation(fixture: LiveFixture, now: Date = new Date()): LiveFixtureValidation {
  const reasons: string[] = []
  const statusShort = fixture.status?.short || ''
  const statusState = (fixture.status as any)?.state || (fixture as any)._state || ''
  const raw = fixture.raw || ''

  const statusNormalized = normalizeStatusCategory(statusShort, statusState, raw)

  // 1. Status must indicate live or halftime
  const isLiveOrHalftime = statusNormalized === 'live' || statusNormalized === 'halftime' || statusNormalized === 'extra_time'

  // Suspended matches get special treatment below (accepted only within 3h)
  const isSuspended = statusNormalized === 'suspended'

  if (!isLiveOrHalftime && !isSuspended) {
    if (statusNormalized === 'finished') reasons.push('Status indica encerrado')
    else if (statusNormalized === 'scheduled') reasons.push('Status indica agendado')
    else reasons.push(`Status desconhecido: "${statusShort}"`)
    return { isLive: false, reasons, statusNormalized, dateDistanceHours: null }
  }

  // 2. Date validation — fixture must be within a reasonable time window
  const fixtureDate = parseFixtureDateSafe(fixture.date)

  if (!fixtureDate) {
    // No date available — accept if status is explicitly live and elapsed is
    // plausible (0–130 minutes). This handles providers that don't send dates.
    const elapsed = fixture.status?.elapsed
    if (elapsed !== null && elapsed !== undefined && elapsed >= 0 && elapsed <= 130 && isLiveOrHalftime) {
      reasons.push('Sem data, mas status live com elapsed plausível')
      return { isLive: true, reasons, statusNormalized, dateDistanceHours: null }
    }
    reasons.push('Sem data confiável e sem elapsed plausível')
    return { isLive: false, reasons, statusNormalized, dateDistanceHours: null }
  }

  const hoursFromNow = getHoursFromNow(fixtureDate, now)

  // 3. Reject if kickoff was too long ago (stale fixture from yesterday)
  if (hoursFromNow > MAX_HOURS_SINCE_KICKOFF) {
    reasons.push(`Kickoff há ${hoursFromNow.toFixed(1)}h (máximo ${MAX_HOURS_SINCE_KICKOFF}h)`)
    return { isLive: false, reasons, statusNormalized, dateDistanceHours: hoursFromNow }
  }

  // 4. Reject if kickoff is too far in the future
  if (hoursFromNow < -MAX_HOURS_AHEAD) {
    reasons.push(`Kickoff em ${Math.abs(hoursFromNow).toFixed(1)}h no futuro`)
    return { isLive: false, reasons, statusNormalized, dateDistanceHours: hoursFromNow }
  }

  // 5. Suspended matches: only accept if within 3 hours (could resume)
  if (isSuspended && hoursFromNow > 3) {
    reasons.push('Jogo suspenso há mais de 3h')
    return { isLive: false, reasons, statusNormalized, dateDistanceHours: hoursFromNow }
  }

  // All checks passed
  reasons.push('Status live + data dentro da janela')
  return { isLive: true, reasons, statusNormalized, dateDistanceHours: hoursFromNow }
}

/**
 * Filter an array of fixtures to only those truly live.
 * Returns { live, rejected } for diagnostics.
 */
export function filterTrulyLiveFixtures(fixtures: LiveFixture[], now: Date = new Date()): {
  live: LiveFixture[]
  rejected: { fixture: LiveFixture; reasons: string[] }[]
} {
  const live: LiveFixture[] = []
  const rejected: { fixture: LiveFixture; reasons: string[] }[] = []

  for (const fx of fixtures) {
    const validation = getLiveFixtureValidation(fx, now)
    if (validation.isLive) {
      live.push(fx)
    } else {
      rejected.push({ fixture: fx, reasons: validation.reasons })
    }
  }

  return { live, rejected }
}
