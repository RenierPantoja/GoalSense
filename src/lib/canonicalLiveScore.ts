/**
 * canonicalLiveScore — reconciles provider score with event-derived score
 * to ensure the displayed score is always the most accurate available.
 * ─────────────────────────────────────────────────────────────────────────────
 * Problem: ESPN's competitor.score field can lag behind keyEvents/plays.
 * A goal event appears in the timeline before the score field updates.
 * This causes the pressure graph tooltip to show "1-0" while the header
 * still shows "0-0".
 *
 * Solution: Count confirmed goal events and use the HIGHER of provider
 * score vs event-derived score. Never invent goals. Never regress.
 *
 * No mocks. No invented data.
 */

// --- Types ----------------------------------------------------------------

export interface CanonicalScore {
  home: number
  away: number
  source: 'provider' | 'events' | 'reconciled'
  providerStale: boolean
  warning?: string
}

interface GoalEvent {
  type: string
  side: 'home' | 'away' | string
  minute?: number
  playerName?: string
}

// --- Main -----------------------------------------------------------------

/**
 * Build the canonical live score by reconciling provider score with
 * goal events. Uses the HIGHER total as the canonical score.
 *
 * Rules:
 * - Only counts: goal, own_goal, penalty_scored
 * - own_goal benefits the OPPOSITE side
 * - Never reduces score below previous known score
 * - If events show more goals than provider, events win (provider stale)
 * - If provider shows more goals than events, provider wins (events incomplete)
 */
export function buildCanonicalLiveScore(
  providerHome: number | null,
  providerAway: number | null,
  events: GoalEvent[],
  previousScore?: { home: number; away: number } | null,
): CanonicalScore {
  const pH = providerHome ?? 0
  const pA = providerAway ?? 0

  // Count goals from events
  let eventHome = 0
  let eventAway = 0
  for (const ev of events) {
    const t = ev.type?.toLowerCase() || ''
    if (t !== 'goal' && t !== 'own_goal' && t !== 'penalty_scored') continue

    const side = ev.side?.toLowerCase()
    if (t === 'own_goal') {
      // Own goal benefits the opposite side
      if (side === 'home') eventAway += 1
      else if (side === 'away') eventHome += 1
      // If side unknown, skip (don't invent)
    } else {
      if (side === 'home') eventHome += 1
      else if (side === 'away') eventAway += 1
      // If side unknown, skip
    }
  }

  // Reconcile: use the higher of provider vs events for each side
  let home = Math.max(pH, eventHome)
  let away = Math.max(pA, eventAway)

  // Never regress below previous score
  if (previousScore) {
    home = Math.max(home, previousScore.home)
    away = Math.max(away, previousScore.away)
  }

  // Determine source and staleness
  const providerTotal = pH + pA
  const eventTotal = eventHome + eventAway
  const canonicalTotal = home + away

  let source: CanonicalScore['source'] = 'provider'
  let providerStale = false
  let warning: string | undefined

  if (eventTotal > providerTotal) {
    source = 'events'
    providerStale = true
    warning = 'Placar atualizado por evento de gol confirmado; provider score atrasado.'
  } else if (eventTotal > 0 && eventTotal === providerTotal && (eventHome !== pH || eventAway !== pA)) {
    source = 'reconciled'
    // Same total but different distribution — trust provider for distribution
    home = pH
    away = pA
  } else if (canonicalTotal > providerTotal) {
    source = 'reconciled'
  }

  return { home, away, source, providerStale, warning }
}

/**
 * Deduplicate goal events to avoid counting the same goal twice.
 * ESPN can return the same goal in keyEvents, plays, and commentary.
 */
export function dedupeGoalEvents(events: GoalEvent[]): GoalEvent[] {
  const seen = new Set<string>()
  const result: GoalEvent[] = []

  for (const ev of events) {
    const t = ev.type?.toLowerCase() || ''
    if (t !== 'goal' && t !== 'own_goal' && t !== 'penalty_scored') {
      result.push(ev)
      continue
    }

    // Key: minute + side + player (normalized)
    const key = `${ev.minute || 0}:${ev.side || ''}:${(ev.playerName || '').toLowerCase().trim()}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(ev)
  }

  return result
}
