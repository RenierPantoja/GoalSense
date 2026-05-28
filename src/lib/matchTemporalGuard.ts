/**
 * matchTemporalGuard — temporal classification for the /app/matches page.
 * -----------------------------------------------------------------------------
 * Problem: providers may keep a match as "SCHEDULED"/"TIMED" even after its
 * kickoff time has passed. The "Próximos" filter relied only on status text,
 * causing past-kickoff matches to appear as upcoming.
 *
 * This module classifies matches into temporal buckets using BOTH the provider
 * status AND the kickoff time relative to now.
 *
 * No mocks. No invented data. No API calls.
 */

export type TemporalBucket =
  | 'live'
  | 'upcoming'
  | 'starting_soon'
  | 'finished'
  | 'stale_scheduled'
  | 'delayed'
  | 'unknown'

export interface MatchTemporalState {
  bucket: TemporalBucket
  reasons: string[]
  minutesFromKickoff: number | null
  shouldAppearInUpcoming: boolean
  shouldAppearInLive: boolean
  shouldAppearInFinished: boolean
}

// --- Constants ---

/** Minutes before kickoff to classify as "starting soon". */
const STARTING_SOON_MINUTES = 60

/** Grace period after scheduled kickoff before we consider it stale.
 *  Accounts for real-world delays (teams entering, anthem, etc.). */
const SCHEDULED_GRACE_MINUTES = 20

/** After this many minutes past kickoff with status still "scheduled",
 *  the match is classified as stale_scheduled. */
const STALE_SCHEDULED_AFTER_MINUTES = 35

// --- Status classification (simplified from matchStatus.ts) ---

const SCHEDULED_STATUSES = new Set([
  'SCHEDULED', 'TIMED', 'PRE', 'NS', 'TBD',
  'STATUS_SCHEDULED', 'STATUS_PRE_GAME',
  'scheduled', 'pre', 'Agendado', 'agendado',
])

const LIVE_STATUSES = new Set([
  'LIVE', 'IN_PLAY', '1H', '2H', 'ET', 'BT', 'P', 'HT', 'HALFTIME', 'PAUSED',
  'STATUS_IN_PROGRESS', 'STATUS_FIRST_HALF', 'STATUS_SECOND_HALF', 'STATUS_HALFTIME',
  'in', 'live', 'Ao vivo', 'ao vivo', 'Intervalo', 'intervalo',
])

const FINISHED_STATUSES = new Set([
  'FINISHED', 'FT', 'AET', 'PEN', 'AWD', 'WO',
  'STATUS_FULL_TIME', 'STATUS_FINAL',
  'post', 'final', 'Encerrado', 'encerrado',
])

const POSTPONED_STATUSES = new Set([
  'POSTPONED', 'PPD', 'PST', 'Adiado', 'adiado',
])

const CANCELLED_STATUSES = new Set([
  'CANCELLED', 'CANCELED', 'SUSPENDED', 'CANC', 'ABD',
  'Cancelado', 'cancelado',
])

function classifyStatus(status: string, state?: string): 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled' | 'unknown' {
  const s = (status || '').trim()
  const st = (state || '').trim()

  if (st === 'post' || FINISHED_STATUSES.has(st) || FINISHED_STATUSES.has(s)) return 'finished'
  if (st === 'in' || LIVE_STATUSES.has(st) || LIVE_STATUSES.has(s)) return 'live'
  if (st === 'pre' || SCHEDULED_STATUSES.has(st) || SCHEDULED_STATUSES.has(s)) return 'scheduled'
  if (POSTPONED_STATUSES.has(s)) return 'postponed'
  if (CANCELLED_STATUSES.has(s)) return 'cancelled'

  return 'unknown'
}

// --- Public API ---

/**
 * Classify a match into a temporal bucket using both status and kickoff time.
 */
export function getMatchTemporalState(
  match: { status: string; utcDate: string; state?: string },
  now: Date = new Date(),
): MatchTemporalState {
  const reasons: string[] = []
  const statusCategory = classifyStatus(match.status, match.state)

  // Parse kickoff time
  const kickoff = new Date(match.utcDate)
  const kickoffValid = !isNaN(kickoff.getTime())
  const minutesFromKickoff = kickoffValid
    ? Math.round((now.getTime() - kickoff.getTime()) / 60000)
    : null

  // --- Finished: always finished regardless of time ---
  if (statusCategory === 'finished') {
    reasons.push('Status indica encerrado')
    return { bucket: 'finished', reasons, minutesFromKickoff, shouldAppearInUpcoming: false, shouldAppearInLive: false, shouldAppearInFinished: true }
  }

  // --- Live: trust status if time is plausible ---
  if (statusCategory === 'live') {
    reasons.push('Status indica ao vivo')
    return { bucket: 'live', reasons, minutesFromKickoff, shouldAppearInUpcoming: false, shouldAppearInLive: true, shouldAppearInFinished: false }
  }

  // --- Postponed/Cancelled ---
  if (statusCategory === 'postponed') {
    reasons.push('Adiado')
    return { bucket: 'delayed', reasons, minutesFromKickoff, shouldAppearInUpcoming: false, shouldAppearInLive: false, shouldAppearInFinished: false }
  }
  if (statusCategory === 'cancelled') {
    reasons.push('Cancelado')
    return { bucket: 'unknown', reasons, minutesFromKickoff, shouldAppearInUpcoming: false, shouldAppearInLive: false, shouldAppearInFinished: false }
  }

  // --- Scheduled: check time ---
  if (statusCategory === 'scheduled' || statusCategory === 'unknown') {
    if (!kickoffValid) {
      reasons.push('Sem horário confiável')
      return { bucket: 'unknown', reasons, minutesFromKickoff: null, shouldAppearInUpcoming: false, shouldAppearInLive: false, shouldAppearInFinished: false }
    }

    // Future: upcoming or starting_soon
    if (minutesFromKickoff !== null && minutesFromKickoff < 0) {
      const minutesUntilKickoff = Math.abs(minutesFromKickoff)
      if (minutesUntilKickoff <= STARTING_SOON_MINUTES) {
        reasons.push(`Começa em ${minutesUntilKickoff} min`)
        return { bucket: 'starting_soon', reasons, minutesFromKickoff, shouldAppearInUpcoming: true, shouldAppearInLive: false, shouldAppearInFinished: false }
      }
      reasons.push('Agendado no futuro')
      return { bucket: 'upcoming', reasons, minutesFromKickoff, shouldAppearInUpcoming: true, shouldAppearInLive: false, shouldAppearInFinished: false }
    }

    // Past: within grace period or stale
    if (minutesFromKickoff !== null) {
      if (minutesFromKickoff <= SCHEDULED_GRACE_MINUTES) {
        // Within grace: could be starting with slight delay
        reasons.push(`Horário previsto há ${minutesFromKickoff} min (dentro da tolerância)`)
        return { bucket: 'starting_soon', reasons, minutesFromKickoff, shouldAppearInUpcoming: true, shouldAppearInLive: false, shouldAppearInFinished: false }
      }
      if (minutesFromKickoff <= STALE_SCHEDULED_AFTER_MINUTES) {
        // Getting stale but still within a reasonable window
        reasons.push(`Horário previsto há ${minutesFromKickoff} min (aguardando atualização)`)
        return { bucket: 'stale_scheduled', reasons, minutesFromKickoff, shouldAppearInUpcoming: false, shouldAppearInLive: false, shouldAppearInFinished: false }
      }
      // Definitely stale
      reasons.push(`Horário previsto há ${minutesFromKickoff} min (status não atualizado)`)
      return { bucket: 'stale_scheduled', reasons, minutesFromKickoff, shouldAppearInUpcoming: false, shouldAppearInLive: false, shouldAppearInFinished: false }
    }
  }

  reasons.push('Classificação indeterminada')
  return { bucket: 'unknown', reasons, minutesFromKickoff, shouldAppearInUpcoming: false, shouldAppearInLive: false, shouldAppearInFinished: false }
}

/**
 * Quick check: should this match appear in the "Próximos" filter?
 */
export function isUpcomingMatch(match: { status: string; utcDate: string; state?: string }, now?: Date): boolean {
  return getMatchTemporalState(match, now).shouldAppearInUpcoming
}

/**
 * Quick check: is this match stale-scheduled (kickoff passed, status not updated)?
 */
export function isStaleScheduled(match: { status: string; utcDate: string; state?: string }, now?: Date): boolean {
  return getMatchTemporalState(match, now).bucket === 'stale_scheduled'
}
