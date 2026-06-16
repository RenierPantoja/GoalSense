/**
 * ESPN Provider — fetches live fixtures from ESPN public API.
 * No API key required. Rate-limited by timeout and backoff.
 */
import { env } from '../env.js'
import type { ProviderFixture, ProviderFetchResult } from './provider.types.js'

const LIVE_STATUSES = new Set(['1H', '2H', 'HT', 'ET', 'P', 'BT'])
const TIMEOUT_MS = 8000

/**
 * Derive a human-readable competition name from an ESPN "all" scoreboard event.
 * The `all` feed does not carry a fixed league slug per event, so we read the
 * explicit league/group name when present and fall back to the season slug.
 */
function extractLeagueName(event: any, comp: any): string {
  const direct = comp?.league?.name || event?.leagues?.[0]?.name || comp?.leagueName
  if (direct && typeof direct === 'string' && direct.trim()) return direct.trim()
  const slug = typeof event?.season?.slug === 'string' ? event.season.slug : ''
  if (slug) {
    return slug.replace(/^\d{4}-\d{2}-/, '').replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
  }
  return 'Liga'
}

function mapEspnStatus(state: string): string {
  const map: Record<string, string> = {
    in: '1H', '1': '1H', '2': '2H',
    half: 'HT', pre: 'NS', post: 'FT',
    end: 'FT', final: 'FT',
    delayed: 'SUSP', suspended: 'SUSP',
    canceled: 'CANC', postponed: 'PST',
  }
  return map[state.toLowerCase()] || state.toUpperCase()
}

export async function fetchEspnLiveFixtures(): Promise<ProviderFetchResult> {
  const start = Date.now()
  const fixtures: ProviderFixture[] = []
  let lastError: string | undefined

  // Use ESPN's global "all" soccer feed for full league coverage (parity with
  // the frontend). A single league slug only returns that competition; the
  // `all` feed returns every live/finished match across all competitions
  // (e.g. Brasileirão Série B, lower divisions, cups worldwide).
  try {
    const url = `${env.ESPN_BASE_URL}/all/scoreboard`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

    const res = await fetch(url, { signal: controller.signal, headers: { 'Accept': 'application/json' } })
    clearTimeout(timeout)

    if (!res.ok) {
      return {
        provider: 'espn',
        endpoint: 'all/scoreboard',
        success: false,
        fixtures,
        latencyMs: Date.now() - start,
        error: `ESPN all/scoreboard: ${res.status}`,
      }
    }

    const json = await res.json() as any
    const events = json?.events || []

    for (const event of events) {
      const comp = event.competitions?.[0]
      if (!comp) continue

      const homeComp = comp.competitors?.find((c: any) => c.homeAway === 'home')
      const awayComp = comp.competitors?.find((c: any) => c.homeAway === 'away')
      if (!homeComp || !awayComp) continue

      const statusDetail = comp.status?.type?.state || event.status?.type?.state || ''
      const mappedStatus = mapEspnStatus(statusDetail)
      const minute = comp.status?.displayClock ? parseInt(comp.status.displayClock) || null : null

      // Only include live or recently finished
      const isLive = LIVE_STATUSES.has(mappedStatus) || statusDetail === 'in'
      const isFinal = mappedStatus === 'FT'
      if (!isLive && !isFinal) continue

      fixtures.push({
        provider: 'espn',
        providerFixtureId: String(event.id),
        homeTeam: homeComp.team?.displayName || homeComp.team?.name || 'Unknown',
        awayTeam: awayComp.team?.displayName || awayComp.team?.name || 'Unknown',
        competition: extractLeagueName(event, comp),
        status: mappedStatus,
        minute: isLive ? minute : null,
        scoreHome: parseInt(homeComp.score) || 0,
        scoreAway: parseInt(awayComp.score) || 0,
        penaltyHome: null,
        penaltyAway: null,
        stats: null, // Stats require summary endpoint (separate call)
        events: null,
        startTime: event.date || new Date().toISOString(),
      })
    }
  } catch (err: any) {
    lastError = err?.name === 'AbortError'
      ? 'ESPN all/scoreboard: timeout'
      : `ESPN all/scoreboard: ${err?.message || 'unknown'}`
  }

  return {
    provider: 'espn',
    endpoint: 'all/scoreboard',
    success: fixtures.length > 0 || !lastError,
    fixtures,
    latencyMs: Date.now() - start,
    error: lastError,
  }
}

// ─── Summary Fetch ───────────────────────────────────────────────────────────

const SUMMARY_TIMEOUT_MS = 6000

export interface EspnSummaryResult {
  success: boolean
  eventId: string
  data: any | null
  latencyMs: number
  error?: string
}

export async function fetchEspnSummary(eventId: string): Promise<EspnSummaryResult> {
  const start = Date.now()
  try {
    const url = `${env.ESPN_BASE_URL}/all/summary?event=${eventId}`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), SUMMARY_TIMEOUT_MS)

    const res = await fetch(url, { signal: controller.signal, headers: { 'Accept': 'application/json' } })
    clearTimeout(timeout)

    if (!res.ok) {
      return { success: false, eventId, data: null, latencyMs: Date.now() - start, error: `HTTP ${res.status}` }
    }

    const data = await res.json()
    return { success: true, eventId, data, latencyMs: Date.now() - start }
  } catch (err: any) {
    const error = err?.name === 'AbortError' ? 'timeout' : (err?.message || 'unknown')
    return { success: false, eventId, data: null, latencyMs: Date.now() - start, error }
  }
}

// ─── Stats Extraction ────────────────────────────────────────────────────────

export interface LiveMatchStats {
  possessionHome?: number
  possessionAway?: number
  shotsHome?: number
  shotsAway?: number
  shotsOnTargetHome?: number
  shotsOnTargetAway?: number
  cornersHome?: number
  cornersAway?: number
  yellowCardsHome?: number
  yellowCardsAway?: number
  redCardsHome?: number
  redCardsAway?: number
  foulsHome?: number
  foulsAway?: number
  offsidesHome?: number
  offsidesAway?: number
  savesHome?: number
  savesAway?: number
}

export function extractEspnStats(summary: any): LiveMatchStats | null {
  const teams = summary?.boxscore?.teams
  if (!teams || teams.length < 2) return null

  const homeStats = teams[0]?.statistics || []
  const awayStats = teams[1]?.statistics || []

  if (homeStats.length === 0 && awayStats.length === 0) return null

  const g = (arr: any[], ...names: string[]): number | undefined => {
    for (const name of names) {
      const s = arr.find((x: any) => x.name === name || x.label === name)
      if (s) {
        const v = parseFloat(s.displayValue)
        return isNaN(v) ? undefined : v
      }
    }
    return undefined
  }

  const stats: LiveMatchStats = {}

  const pH = g(homeStats, 'possessionPct', 'POSSESSION', 'Possession')
  const pA = g(awayStats, 'possessionPct', 'POSSESSION', 'Possession')
  if (pH !== undefined) stats.possessionHome = pH
  if (pA !== undefined) stats.possessionAway = pA

  const sH = g(homeStats, 'totalShots', 'SHOTS', 'Total Shots')
  const sA = g(awayStats, 'totalShots', 'SHOTS', 'Total Shots')
  if (sH !== undefined) stats.shotsHome = sH
  if (sA !== undefined) stats.shotsAway = sA

  const sotH = g(homeStats, 'shotsOnTarget', 'ON GOAL', 'Shots on Target')
  const sotA = g(awayStats, 'shotsOnTarget', 'ON GOAL', 'Shots on Target')
  if (sotH !== undefined) stats.shotsOnTargetHome = sotH
  if (sotA !== undefined) stats.shotsOnTargetAway = sotA

  const cH = g(homeStats, 'wonCorners', 'Corner Kicks', 'Corners')
  const cA = g(awayStats, 'wonCorners', 'Corner Kicks', 'Corners')
  if (cH !== undefined) stats.cornersHome = cH
  if (cA !== undefined) stats.cornersAway = cA

  const ycH = g(homeStats, 'yellowCards', 'Yellow Cards')
  const ycA = g(awayStats, 'yellowCards', 'Yellow Cards')
  if (ycH !== undefined) stats.yellowCardsHome = ycH
  if (ycA !== undefined) stats.yellowCardsAway = ycA

  const rcH = g(homeStats, 'redCards', 'Red Cards')
  const rcA = g(awayStats, 'redCards', 'Red Cards')
  if (rcH !== undefined) stats.redCardsHome = rcH
  if (rcA !== undefined) stats.redCardsAway = rcA

  const fH = g(homeStats, 'foulsCommitted', 'Fouls', 'FOULS')
  const fA = g(awayStats, 'foulsCommitted', 'Fouls', 'FOULS')
  if (fH !== undefined) stats.foulsHome = fH
  if (fA !== undefined) stats.foulsAway = fA

  const oH = g(homeStats, 'offsides', 'Offsides', 'OFFSIDES')
  const oA = g(awayStats, 'offsides', 'Offsides', 'OFFSIDES')
  if (oH !== undefined) stats.offsidesHome = oH
  if (oA !== undefined) stats.offsidesAway = oA

  const svH = g(homeStats, 'saves', 'Saves', 'SAVES')
  const svA = g(awayStats, 'saves', 'Saves', 'SAVES')
  if (svH !== undefined) stats.savesHome = svH
  if (svA !== undefined) stats.savesAway = svA

  // Only return if we got at least some meaningful data
  if (Object.keys(stats).length === 0) return null
  return stats
}

// ─── Timed Events Extraction ─────────────────────────────────────────────────

export interface BackendTimedEvent {
  provider: 'espn'
  minute: number
  addedTime?: number
  type: string
  side: 'home' | 'away' | 'unknown'
  teamName?: string
  playerName?: string
  description?: string
}

const EVENT_TYPE_MAP: Record<string, string> = {
  goal: 'goal',
  'goal - header': 'goal',
  'goal - free-kick': 'goal',
  'own goal': 'own_goal',
  'penalty - scored': 'penalty_scored',
  'penalty - missed': 'penalty_missed',
  'penalty - saved': 'penalty_missed',
  'yellow card': 'yellow_card',
  'red card': 'red_card',
  'second yellow card': 'red_card',
  substitution: 'substitution',
  'substitution - on': 'substitution',
  'substitution - off': 'substitution',
  offside: 'offside',
  'goal disallowed': 'goal_disallowed',
  'disallowed goal': 'goal_disallowed',
  var: 'var',
}

export function extractEspnTimedEvents(summary: any, homeTeam?: string, awayTeam?: string): BackendTimedEvent[] {
  const events: BackendTimedEvent[] = []

  // Try keyEvents first, then details
  const rawEvents = summary?.keyEvents || summary?.details || []
  if (!Array.isArray(rawEvents)) return events

  const homeId = summary?.boxscore?.teams?.[0]?.team?.id
  const awayId = summary?.boxscore?.teams?.[1]?.team?.id

  for (const raw of rawEvents) {
    const clock = raw.clock || raw.time || {}
    let minute: number | null = null
    let addedTime: number | undefined

    if (typeof clock.displayValue === 'string') {
      // Handle formats like "45", "45'+2", "90+3"
      const display = clock.displayValue.replace(/'/g, '')
      const parts = display.split('+')
      const base = parseInt(parts[0])
      if (!isNaN(base)) {
        minute = base
        if (parts[1]) {
          const added = parseInt(parts[1])
          if (!isNaN(added)) addedTime = added
        }
      }
    } else if (typeof clock.minutes === 'number') {
      minute = clock.minutes
    }

    if (minute === null) continue // Skip events without minute

    const rawType = (raw.type?.text || raw.type?.name || raw.text || '').toLowerCase().trim()
    const type = EVENT_TYPE_MAP[rawType] || 'unknown'

    // Determine side
    let side: 'home' | 'away' | 'unknown' = 'unknown'
    const teamId = raw.team?.id || raw.teamId
    if (teamId) {
      if (String(teamId) === String(homeId)) side = 'home'
      else if (String(teamId) === String(awayId)) side = 'away'
    }

    const playerName = raw.athletesInvolved?.[0]?.displayName || raw.playerName || undefined
    const teamName = side === 'home' ? homeTeam : side === 'away' ? awayTeam : undefined

    events.push({
      provider: 'espn',
      minute,
      addedTime: addedTime || clock.addedMinutes || undefined,
      type,
      side,
      teamName,
      playerName,
      description: raw.text || raw.shortText || undefined,
    })
  }

  return events.sort((a, b) => a.minute - b.minute)
}

// ─── Shootout Events ─────────────────────────────────────────────────────────

export interface ShootoutEvent {
  provider: 'espn'
  sequence: number
  side: 'home' | 'away' | 'unknown'
  playerName?: string
  outcome: 'scored' | 'missed' | 'saved' | 'post' | 'unknown'
  description?: string
}

export function extractEspnShootoutEvents(summary: any): ShootoutEvent[] {
  const events: ShootoutEvent[] = []

  // ESPN stores shootout in a specific structure
  const shootout = summary?.shootout || summary?.penaltyShootout
  if (!shootout) return events

  const rounds = shootout.rounds || shootout.kicks || []
  if (!Array.isArray(rounds)) return events

  const homeId = summary?.boxscore?.teams?.[0]?.team?.id
  let seq = 0

  for (const round of rounds) {
    const kicks = round.kicks || [round]
    for (const kick of kicks) {
      seq++
      const teamId = kick.team?.id || kick.teamId
      let side: 'home' | 'away' | 'unknown' = 'unknown'
      if (String(teamId) === String(homeId)) side = 'home'
      else if (teamId) side = 'away'

      const outcomeRaw = (kick.result || kick.outcome || '').toLowerCase()
      let outcome: ShootoutEvent['outcome'] = 'unknown'
      if (outcomeRaw.includes('scored') || outcomeRaw.includes('goal') || outcomeRaw === 'made') outcome = 'scored'
      else if (outcomeRaw.includes('saved')) outcome = 'saved'
      else if (outcomeRaw.includes('missed') || outcomeRaw === 'missed') outcome = 'missed'
      else if (outcomeRaw.includes('post') || outcomeRaw.includes('bar')) outcome = 'post'

      events.push({
        provider: 'espn',
        sequence: seq,
        side,
        playerName: kick.athlete?.displayName || kick.playerName || undefined,
        outcome,
        description: kick.text || undefined,
      })
    }
  }

  return events
}
