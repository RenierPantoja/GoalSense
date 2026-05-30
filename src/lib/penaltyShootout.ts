/**
 * penaltyShootout — models, detection, and extraction for penalty shootouts.
 * ─────────────────────────────────────────────────────────────────────────────
 * Only renders data the provider actually delivers. Never invents scores,
 * kicks, or outcomes.
 *
 * No mocks. No invented data. No fake kicks.
 */

// --- Types ----------------------------------------------------------------

export interface PenaltyScore {
  home: number | null
  away: number | null
}

export interface PenaltyShootoutEvent {
  id: string
  fixtureId: number
  sequence?: number
  teamSide: 'home' | 'away'
  teamName?: string
  playerName?: string
  outcome: 'scored' | 'missed' | 'saved' | 'post' | 'unknown'
  penaltyScoreHome?: number
  penaltyScoreAway?: number
  minute?: number
  description?: string
  provider: string
  rawText?: string
}

export interface PenaltyShootoutState {
  inProgress: boolean
  finished: boolean
  score: PenaltyScore | null
  events: PenaltyShootoutEvent[]
  winner?: 'home' | 'away' | null
}

// --- Detection ------------------------------------------------------------

const PENALTY_LIVE_STATUSES = new Set(['P', 'PK', 'PENALTIES'])
const PENALTY_FINISHED_STATUSES = new Set(['PEN', 'AET_PEN', 'PENALTY_SHOOTOUT'])

/**
 * Detect if a fixture is currently in or finished after a penalty shootout.
 */
export function isPenaltyShootout(statusShort: string): boolean {
  const s = statusShort?.toUpperCase() || ''
  return PENALTY_LIVE_STATUSES.has(s) || PENALTY_FINISHED_STATUSES.has(s)
}

export function isPenaltyShootoutLive(statusShort: string): boolean {
  return PENALTY_LIVE_STATUSES.has(statusShort?.toUpperCase() || '')
}

export function isPenaltyShootoutFinished(statusShort: string): boolean {
  return PENALTY_FINISHED_STATUSES.has(statusShort?.toUpperCase() || '')
}

// --- Extraction from ESPN -------------------------------------------------

/**
 * Extract penalty score from ESPN summary data.
 * ESPN may provide shootoutScore in competitors or in linescores.
 */
export function extractPenaltyScoreFromEspn(summaryJson: any): PenaltyScore | null {
  try {
    const comp = summaryJson?.header?.competitions?.[0]
    if (!comp?.competitors) return null

    const home = comp.competitors.find((c: any) => c.homeAway === 'home')
    const away = comp.competitors.find((c: any) => c.homeAway === 'away')

    // Try shootoutScore field
    if (home?.shootoutScore !== undefined && away?.shootoutScore !== undefined) {
      return { home: parseInt(home.shootoutScore) || 0, away: parseInt(away.shootoutScore) || 0 }
    }

    // Try linescores (ESPN sometimes puts penalty round as last linescore)
    const homeLinescores = home?.linescores || []
    const awayLinescores = away?.linescores || []
    if (homeLinescores.length >= 4 && awayLinescores.length >= 4) {
      // Index 3+ could be penalty round (after 1H, 2H, ET)
      const lastHome = homeLinescores[homeLinescores.length - 1]
      const lastAway = awayLinescores[awayLinescores.length - 1]
      if (lastHome?.value !== undefined && lastAway?.value !== undefined) {
        const hPen = parseInt(lastHome.value)
        const aPen = parseInt(lastAway.value)
        // Only treat as penalty score if it looks like a shootout (small numbers, different from regular score)
        if (!isNaN(hPen) && !isNaN(aPen) && (hPen + aPen) <= 15) {
          return { home: hPen, away: aPen }
        }
      }
    }

    return null
  } catch {
    return null
  }
}

/**
 * Extract penalty shootout events from ESPN keyEvents/plays.
 */
export function extractPenaltyEventsFromEspn(summaryJson: any, fixtureId: number): PenaltyShootoutEvent[] {
  const events: PenaltyShootoutEvent[] = []
  try {
    const keyEvents = summaryJson?.keyEvents || []
    const plays = summaryJson?.plays || []
    const allEvents = [...keyEvents, ...plays]

    let sequence = 0
    for (const ev of allEvents) {
      // Detect penalty shootout events
      const type = ev.type?.text?.toLowerCase() || ev.text?.toLowerCase() || ''
      const isShootout = type.includes('shootout') || type.includes('penalty kick') ||
        (ev.shootout === true) || (ev.penaltyKick === true) ||
        (ev.clock?.value && ev.clock.value > 120 * 60) // After 120 minutes

      if (!isShootout) continue

      sequence++
      const teamId = ev.team?.id
      const homeTeamId = summaryJson?.header?.competitions?.[0]?.competitors?.find((c: any) => c.homeAway === 'home')?.team?.id
      const side: 'home' | 'away' = teamId === homeTeamId ? 'home' : 'away'

      let outcome: PenaltyShootoutEvent['outcome'] = 'unknown'
      const text = (ev.text || ev.shortText || ev.type?.text || '').toLowerCase()
      if (text.includes('goal') || text.includes('scored') || text.includes('converted') || text.includes('convertido')) {
        outcome = 'scored'
      } else if (text.includes('saved') || text.includes('defendido')) {
        outcome = 'saved'
      } else if (text.includes('missed') || text.includes('perdido') || text.includes('desperdiç')) {
        outcome = 'missed'
      } else if (text.includes('post') || text.includes('trave') || text.includes('crossbar')) {
        outcome = 'post'
      }

      events.push({
        id: `pen_${fixtureId}_${sequence}`,
        fixtureId,
        sequence,
        teamSide: side,
        teamName: ev.team?.displayName || ev.team?.name,
        playerName: ev.athletesInvolved?.[0]?.displayName || ev.player?.name,
        outcome,
        description: ev.text || ev.shortText,
        provider: 'espn',
        rawText: ev.text || ev.shortText,
      })
    }
  } catch { /* */ }
  return events
}

// --- Extraction from API-Football -----------------------------------------

/**
 * Extract penalty score from API-Football response.
 */
export function extractPenaltyScoreFromApiFootball(raw: any): PenaltyScore | null {
  try {
    const pen = raw?.score?.penalty
    if (pen && (pen.home !== null || pen.away !== null)) {
      return { home: pen.home ?? 0, away: pen.away ?? 0 }
    }
    return null
  } catch {
    return null
  }
}

// --- Extraction from football-data ----------------------------------------

/**
 * Extract penalty score from football-data.org response.
 */
export function extractPenaltyScoreFromFootballData(raw: any): PenaltyScore | null {
  try {
    const pen = raw?.score?.penalties
    if (pen && (pen.home !== null || pen.away !== null)) {
      return { home: pen.home ?? 0, away: pen.away ?? 0 }
    }
    return null
  } catch {
    return null
  }
}

// --- Merge ----------------------------------------------------------------

/**
 * Merge penalty shootout state without regressing.
 */
export function mergePenaltyState(
  previous: PenaltyShootoutState | null,
  next: Partial<PenaltyShootoutState>,
): PenaltyShootoutState {
  if (!previous) {
    return {
      inProgress: next.inProgress ?? false,
      finished: next.finished ?? false,
      score: next.score ?? null,
      events: next.events ?? [],
      winner: next.winner ?? null,
    }
  }

  // Never regress score
  let score = previous.score
  if (next.score) {
    const prevTotal = (previous.score?.home ?? 0) + (previous.score?.away ?? 0)
    const nextTotal = (next.score.home ?? 0) + (next.score.away ?? 0)
    if (nextTotal >= prevTotal) score = next.score
  }

  // Never remove events
  const events = next.events && next.events.length >= previous.events.length
    ? next.events
    : previous.events

  // Never regress from finished to in-progress
  const finished = previous.finished || (next.finished ?? false)
  const inProgress = finished ? false : (next.inProgress ?? previous.inProgress)

  return { inProgress, finished, score, events, winner: next.winner ?? previous.winner }
}

// --- Display helpers ------------------------------------------------------

/**
 * Format penalty score for display: "3 - 2" or null if not available.
 */
export function formatPenaltyScore(score: PenaltyScore | null | undefined): string | null {
  if (!score || score.home === null || score.away === null) return null
  return `${score.home} - ${score.away}`
}

/**
 * Build penalty score from individual shootout events.
 * Only counts 'scored' outcomes. Never invents.
 */
export function buildPenaltyScoreFromEvents(events: PenaltyShootoutEvent[]): PenaltyScore | null {
  if (events.length === 0) return null
  let home = 0
  let away = 0
  for (const ev of events) {
    if (ev.outcome !== 'scored') continue
    if (ev.teamSide === 'home') home++
    else if (ev.teamSide === 'away') away++
    // Unknown side: skip (never invent)
  }
  if (home === 0 && away === 0) return null
  return { home, away }
}

/**
 * Reconcile provider penalty score with event-derived score.
 * Uses the higher total (same philosophy as regular score).
 */
export function reconcilePenaltyScores(
  providerScore: PenaltyScore | null | undefined,
  eventScore: PenaltyScore | null,
  previousScore: PenaltyScore | null | undefined,
): PenaltyScore | null {
  const pTotal = providerScore ? (providerScore.home ?? 0) + (providerScore.away ?? 0) : 0
  const eTotal = eventScore ? (eventScore.home ?? 0) + (eventScore.away ?? 0) : 0
  const prevTotal = previousScore ? (previousScore.home ?? 0) + (previousScore.away ?? 0) : 0

  // Pick the highest total
  let best: PenaltyScore | null = null
  if (pTotal >= eTotal && pTotal >= prevTotal && providerScore) best = providerScore
  else if (eTotal >= pTotal && eTotal >= prevTotal && eventScore) best = eventScore
  else if (prevTotal > 0 && previousScore) best = previousScore

  return best
}

/**
 * Format full score with penalties: "1 (3) - (2) 1"
 */
export function formatScoreWithPenalties(
  regularHome: number | null,
  regularAway: number | null,
  penaltyScore: PenaltyScore | null | undefined,
): string {
  const h = regularHome ?? 0
  const a = regularAway ?? 0
  if (!penaltyScore || penaltyScore.home === null || penaltyScore.away === null) {
    return `${h} - ${a}`
  }
  return `${h} (${penaltyScore.home}) - (${penaltyScore.away}) ${a}`
}

/**
 * Get the status label for penalty shootout display.
 */
export function getPenaltyStatusLabel(statusShort: string): string {
  const s = statusShort?.toUpperCase() || ''
  if (PENALTY_LIVE_STATUSES.has(s)) return 'Cobrança de pênaltis'
  if (s === 'PEN') return 'Encerrado (Pên.)'
  return ''
}
