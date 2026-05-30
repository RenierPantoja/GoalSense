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

export interface CommandEventsQuality {
  source: 'espn_summary' | 'none'
  totalEvents: number
  timedEvents: number
  offensiveEvents: number
  recentEvents: number
  hasCommentary: boolean
  hasKeyEvents: boolean
  quality: 'rich' | 'partial' | 'poor' | 'none'
  warnings: string[]
}

/** Offensive event types that count for momentum. */
export const OFFENSIVE_EVENT_TYPES: CommandTimedEvent['type'][] = [
  'shot_on_target', 'shot_off_target', 'corner', 'dangerous_attack', 'goal',
  'penalty_scored', 'penalty_missed',
]

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

  // Deduplicate: use minute+type+side+teamName for more precise dedup
  const seen = new Set<string>()
  return events.filter(e => {
    const key = `${e.minute}-${e.type}-${e.side}-${(e.teamName || '').slice(0, 10)}`
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
  // Goals (but not goal kicks)
  if ((text.includes('goal') && !text.includes('goal kick') && !text.includes('goalkeeper')) || text.includes('gol')) return 'goal'
  // Shots on target — comprehensive
  if (text.includes('on target') || text.includes('attempt saved') || text.includes('saved shot') ||
      text.includes('goalkeeper save') || text.includes('shot saved') || text.includes('no alvo') ||
      text.includes('finalização defendida') || text.includes('chute defendido') ||
      text.includes('defesa do goleiro') || text.includes('hits the post') ||
      text.includes('hits the bar') || text.includes('strikes the post') ||
      text.includes('blocked shot') || text.includes('blocked')) return 'shot_on_target'
  // Shots off target — comprehensive
  if (text.includes('off target') || text.includes('attempt missed') || text.includes('missed shot') ||
      text.includes('wide') || text.includes('over the bar') || text.includes('high and wide') ||
      text.includes('para fora') || text.includes('por cima') || text.includes('finalização para fora') ||
      text.includes('chute para fora')) return 'shot_off_target'
  // Generic shot/attempt (classify as off-target to be conservative)
  if (text.includes('attempt') || text.includes('shot') || text.includes('header') || text.includes('finalização')) {
    if (text.includes('saved') || text.includes('blocked') || text.includes('defendid')) return 'shot_on_target'
    return 'shot_off_target'
  }
  // Corners
  if (text.includes('corner') || text.includes('escanteio')) return 'corner'
  // Dangerous attacks
  if (text.includes('dangerous') || text.includes('chance') || text.includes('perigoso')) return 'dangerous_attack'
  return 'unknown'
}

function resolveSide(teamId: any, json: any, _homeName: string, _awayName: string): CommandTimedEvent['side'] {
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

/**
 * Assess the quality of extracted events for a fixture.
 */
export function assessEventsQuality(events: CommandTimedEvent[], currentMinute: number, windowMinutes: number = 10): CommandEventsQuality {
  if (events.length === 0) {
    return { source: 'none', totalEvents: 0, timedEvents: 0, offensiveEvents: 0, recentEvents: 0, hasCommentary: false, hasKeyEvents: false, quality: 'none', warnings: ['Nenhum evento disponível'] }
  }

  const recent = getEventsInWindow(events, currentMinute, windowMinutes)
  const offensive = events.filter(e => OFFENSIVE_EVENT_TYPES.includes(e.type))
  const recentOffensive = recent.filter(e => OFFENSIVE_EVENT_TYPES.includes(e.type))
  const hasKeyEvents = events.some(e => ['goal', 'own_goal', 'penalty_scored', 'yellow_card', 'red_card', 'substitution'].includes(e.type))
  const hasCommentary = events.some(e => ['shot_on_target', 'shot_off_target', 'corner', 'dangerous_attack'].includes(e.type))

  const warnings: string[] = []
  if (!hasCommentary) warnings.push('Sem commentary/shots do provider')
  if (offensive.length === 0) warnings.push('Sem eventos ofensivos')
  if (recent.length === 0 && currentMinute > windowMinutes) warnings.push('Sem eventos recentes na janela')

  let quality: CommandEventsQuality['quality']
  if (hasCommentary && hasKeyEvents && offensive.length >= 4) quality = 'rich'
  else if ((hasCommentary || hasKeyEvents) && offensive.length >= 2) quality = 'partial'
  else if (events.length > 0) quality = 'poor'
  else quality = 'none'

  return {
    source: 'espn_summary',
    totalEvents: events.length,
    timedEvents: events.length,
    offensiveEvents: offensive.length,
    recentEvents: recentOffensive.length,
    hasCommentary,
    hasKeyEvents,
    quality,
    warnings,
  }
}
