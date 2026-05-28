/**
 * commandTimedEvents — extracts timed events from ESPN summary for momentum.
 * ---------------------------------------------------------------------------------
 * ESPN summary endpoint returns `keyEvents` and/or `commentary` arrays with
 * clock/minute data. We normalize these into CommandTimedEvent[] for the
 * MomentumWindowEngine.
 *
 * No mocks. No invented events. Only real provider data with valid minutes.
 */

// --- Types ----------------------------------------------------------------

export interface CommandTimedEvent {
  id: string
  fixtureId: number
  minute: number
  addedTime?: number
  type: 'goal' | 'own_goal' | 'penalty_scored' | 'penalty_missed' | 'shot_on_target' | 'shot_off_target' | 'corner' | 'yellow_card' | 'red_card' | 'second_yellow' | 'substitution' | 'var' | 'dangerous_attack' | 'attack' | 'unknown'
  side: 'home' | 'away' | 'neutral' | 'unknown'
  teamName?: string
  playerName?: string
  description?: string
  provider: string
}

// --- ESPN event extraction ------------------------------------------------

/**
 * Extract timed events from an ESPN summary JSON response.
 * Call this with the same `json` already fetched for stats.
 */
export function extractEspnTimedEvents(json: any, fixtureId: number, homeTeamName: string, awayTeamName: string): CommandTimedEvent[] {
  const events: CommandTimedEvent[] = []

  // ESPN keyEvents (goals, cards, substitutions)
  const keyEvents = json?.keyEvents || json?.header?.competitions?.[0]?.details || []
  for (const ev of keyEvents) {
    const minute = parseEspnMinute(ev.clock?.displayValue || ev.clock?.value || ev.time?.displayValue || '')
    if (minute === null || minute <= 0) continue

    const type = classifyEspnEventType(ev)
    const teamId = ev.team?.id || ev.teamId
    const side = resolveSide(teamId, json, homeTeamName, awayTeamName)
    const teamName = ev.team?.displayName || ev.team?.name || undefined
    const playerName = ev.athletesInvolved?.[0]?.displayName || ev.athlete?.displayName || undefined

    events.push({
      id: `espn-${fixtureId}-${minute}-${type}-${events.length}`,
      fixtureId,
      minute,
      type,
      side,
      teamName,
      playerName,
      description: ev.text || ev.shortText || undefined,
      provider: 'espn',
    })
  }

  // ESPN commentary/plays (shots, corners, attacks)
  const commentary = json?.commentary || json?.plays || []
  for (const c of commentary) {
    const minute = parseEspnMinute(c.clock?.displayValue || c.time?.displayValue || c.clock || '')
    if (minute === null || minute <= 0) continue

    const text = (c.text || c.shortText || '').toLowerCase()
    const type = classifyCommentaryType(text)
    if (type === 'unknown') continue // skip non-actionable commentary

    const teamName = c.team?.displayName || undefined
    const side = teamName ? resolveSideByName(teamName, homeTeamName, awayTeamName) : 'unknown'

    events.push({
      id: `espn-c-${fixtureId}-${minute}-${type}-${events.length}`,
      fixtureId,
      minute,
      type,
      side,
      teamName,
      description: c.text || c.shortText || undefined,
      provider: 'espn',
    })
  }

  // Deduplicate by minute+type (keep first)
  const seen = new Set<string>()
  return events.filter(e => {
    const key = `${e.minute}-${e.type}-${e.side}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// --- Helpers --------------------------------------------------------------

function parseEspnMinute(clock: string): number | null {
  if (!clock) return null
  // Formats: "72'", "72", "45+2", "90+3'"
  const match = clock.match(/(\d+)/)
  if (!match) return null
  return parseInt(match[1]) || null
}

function classifyEspnEventType(ev: any): CommandTimedEvent['type'] {
  const type = (ev.type?.text || ev.type?.name || ev.type || '').toLowerCase()
  const text = (ev.text || ev.shortText || '').toLowerCase()

  if (type.includes('goal') || text.includes('goal')) {
    if (text.includes('own goal') || text.includes('og')) return 'own_goal'
    if (text.includes('penalty') && (text.includes('scored') || text.includes('converted'))) return 'penalty_scored'
    if (text.includes('penalty') && (text.includes('missed') || text.includes('saved'))) return 'penalty_missed'
    return 'goal'
  }
  if (type.includes('yellow') || text.includes('yellow card')) {
    if (text.includes('second yellow')) return 'second_yellow'
    return 'yellow_card'
  }
  if (type.includes('red') || text.includes('red card')) return 'red_card'
  if (type.includes('substitution') || text.includes('substitution')) return 'substitution'
  if (type.includes('var') || text.includes('var')) return 'var'
  return 'unknown'
}

function classifyCommentaryType(text: string): CommandTimedEvent['type'] {
  if (text.includes('goal') && !text.includes('goal kick')) return 'goal'
  if (text.includes('on target') || text.includes('saved') || text.includes('blocked') || text.includes('hits the post') || text.includes('hits the bar')) return 'shot_on_target'
  if (text.includes('off target') || text.includes('misses') || text.includes('wide') || text.includes('over the bar')) return 'shot_off_target'
  if (text.includes('attempt') || text.includes('shot') || text.includes('header')) {
    if (text.includes('saved') || text.includes('blocked')) return 'shot_on_target'
    return 'shot_off_target'
  }
  if (text.includes('corner')) return 'corner'
  if (text.includes('dangerous') || text.includes('chance')) return 'dangerous_attack'
  return 'unknown'
}

function resolveSide(teamId: any, json: any, homeName: string, awayName: string): CommandTimedEvent['side'] {
  if (!teamId) return 'unknown'
  const competitors = json?.header?.competitions?.[0]?.competitors || json?.boxscore?.teams || []
  for (const c of competitors) {
    if (String(c.id || c.team?.id) === String(teamId)) {
      if (c.homeAway === 'home' || c.order === 1) return 'home'
      if (c.homeAway === 'away' || c.order === 2) return 'away'
    }
  }
  return 'unknown'
}

function resolveSideByName(teamName: string, homeName: string, awayName: string): CommandTimedEvent['side'] {
  const t = teamName.toLowerCase()
  const h = homeName.toLowerCase()
  const a = awayName.toLowerCase()
  if (t.includes(h) || h.includes(t)) return 'home'
  if (t.includes(a) || a.includes(t)) return 'away'
  return 'unknown'
}

/**
 * Filter events within a time window relative to current minute.
 */
export function getEventsInWindow(events: CommandTimedEvent[], currentMinute: number, windowMinutes: number): CommandTimedEvent[] {
  const cutoff = currentMinute - windowMinutes
  return events.filter(e => e.minute >= cutoff && e.minute <= currentMinute)
}
