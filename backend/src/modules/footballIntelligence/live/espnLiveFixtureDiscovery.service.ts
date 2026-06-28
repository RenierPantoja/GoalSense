/**
 * ESPN Live Fixture Discovery Service — B57 Real Live Discovery
 * ─────────────────────────────────────────────────────────────────────────────
 * Discovers real ESPN live fixtures for monitoring sessions.
 * Filters and prioritizes based on data availability and validation limits.
 */
import { env } from '../../../env.js'
import { fetchEspnLiveFixtures } from '../../../providers/espn.provider.js'
import { createRepositories } from '../../../repositories/index.js'
import type { LiveFixtureSelectionResult } from './liveMonitoringSession.types.js'

const LIVE_STATUSES = new Set(['1H', '2H', 'HT', 'ET', 'P', 'BT'])
const SCHEDULED_SOON_STATUSES = new Set(['NS']) // Optional: próximos jogos

interface EspnLiveFixture {
  providerFixtureId: string
  homeTeam: string
  awayTeam: string
  competition: string
  status: string
  minute?: number | null
  score: { home: number; away: number }
  startTime: string
}

/**
 * Discover live fixtures from ESPN right now
 */
export async function discoverLiveFixturesNow(): Promise<LiveFixtureSelectionResult> {
  const result = await fetchEspnLiveFixtures()

  if (!result.success) {
    return {
      totalFound: 0,
      selected: [],
      skipped: [],
      limitations: [`ESPN fetch failed: ${result.error || 'unknown'}`]
    }
  }

  const espnFixtures: EspnLiveFixture[] = result.fixtures.map(f => ({
    providerFixtureId: f.providerFixtureId,
    homeTeam: f.homeTeam,
    awayTeam: f.awayTeam,
    competition: f.competition,
    status: f.status,
    minute: f.minute,
    score: { home: f.scoreHome, away: f.scoreAway },
    startTime: f.startTime
  }))

  return filterLiveFixturesForValidation(espnFixtures)
}

/**
 * Discover fixtures by live status
 */
export async function discoverFixturesByLiveStatus(
  targetStatus: 'in_progress' | 'halftime' | 'scheduled_soon'
): Promise<LiveFixtureSelectionResult> {
  const all = await discoverLiveFixturesNow()

  const statusMap: Record<string, Set<string>> = {
    in_progress: new Set(['1H', '2H', 'ET', 'P']),
    halftime: new Set(['HT']),
    scheduled_soon: new Set(['NS'])
  }

  const targetStatuses = statusMap[targetStatus] || new Set()

  const filtered = all.selected.filter(f =>
    targetStatuses.has(f.status)
  )

  return {
    ...all,
    selected: filtered,
    limitations: [
      ...all.limitations,
      `Filtered for status ${targetStatus}: ${filtered.length}/${all.selected.length}`
    ]
  }
}

/**
 * Filter and prioritize fixtures for validation monitoring
 */
export function filterLiveFixturesForValidation(
  fixtures: EspnLiveFixture[]
): LiveFixtureSelectionResult {
  const selected: LiveFixtureSelectionResult['selected'] = []
  const skipped: LiveFixtureSelectionResult['skipped'] = []
  const limitations: string[] = []

  // Get validation limits from env
  const maxFixtures = parseInt(process.env.LOCAL_VALIDATION_MAX_FIXTURES || '5')

  // Filter and score fixtures
  const scoredFixtures = fixtures
    .map(f => {
      const isLive = LIVE_STATUSES.has(f.status)
      const isScheduledSoon = SCHEDULED_SOON_STATUSES.has(f.status)

      // Skip non-live/non-scheduled
      if (!isLive && !isScheduledSoon) {
        skipped.push({
          fixtureId: f.providerFixtureId,
          reason: `Status ${f.status} not live or scheduled soon`
        })
        return null
      }

      // Score based on data availability and monitoring value
      let score = 0
      let dataAvailability: 'rich' | 'partial' | 'poor' = 'poor'
      const fixturelimitations: string[] = []

      // Live matches get priority
      if (isLive) {
        score += 100
        if (f.minute && f.minute > 0) {
          score += 50 // Has active play time
          dataAvailability = 'partial'
        }
        if (f.score.home > 0 || f.score.away > 0) {
          score += 30 // Has goals
          dataAvailability = 'rich'
        }
        if (f.status === '1H' || f.status === '2H') {
          score += 20 // Active play
        }
      }

      // Competition priority (can be enhanced with known leagues)
      if (f.competition.toLowerCase().includes('premier')) score += 15
      if (f.competition.toLowerCase().includes('champions')) score += 15
      if (f.competition.toLowerCase().includes('bundesliga')) score += 10
      if (f.competition.toLowerCase().includes('la liga')) score += 10

      // Team name clarity (avoid unknown teams)
      if (f.homeTeam === 'Unknown' || f.awayTeam === 'Unknown') {
        score -= 50
        fixturelimitations.push('Unknown team names')
      }

      return {
        fixture: f,
        score,
        dataAvailability,
        limitations: fixturelimitations
      }
    })
    .filter(Boolean) // Remove nulls
    .sort((a, b) => (b?.score || 0) - (a?.score || 0)) // Highest score first

  // Select top fixtures within limit
  const topFixtures = scoredFixtures.slice(0, maxFixtures)
  const extraFixtures = scoredFixtures.slice(maxFixtures)

  // Add selected fixtures
  topFixtures.forEach(item => {
    if (!item) return

    const { fixture: f, dataAvailability, limitations: fixtureLimit } = item

    selected.push({
      fixtureId: f.providerFixtureId,
      teams: `${f.homeTeam} vs ${f.awayTeam}`,
      competition: f.competition,
      status: f.status,
      minute: f.minute,
      score: f.score,
      dataAvailability,
      selectionReason: LIVE_STATUSES.has(f.status)
        ? `Live ${f.status}${f.minute ? ` min ${f.minute}` : ''}`
        : 'Scheduled soon',
      limitations: fixtureLimit
    })
  })

  // Add skipped due to limit
  extraFixtures.forEach(item => {
    if (!item) return
    skipped.push({
      fixtureId: item.fixture.providerFixtureId,
      reason: `Exceeded max fixtures limit (${maxFixtures})`
    })
  })

  // Add global limitations
  if (scoredFixtures.length === 0) {
    limitations.push('No suitable live fixtures found for monitoring')
  }
  if (extraFixtures.length > 0) {
    limitations.push(`${extraFixtures.length} fixtures skipped due to limit`)
  }

  return {
    totalFound: fixtures.length,
    selected,
    skipped,
    limitations
  }
}

/**
 * Explain why a fixture was selected or skipped
 */
export async function explainLiveFixtureSelection(fixtureId: string): Promise<{
  found: boolean
  selected: boolean
  reason: string
  details: any
}> {
  const discovery = await discoverLiveFixturesNow()

  const selected = discovery.selected.find(f => f.fixtureId === fixtureId)
  if (selected) {
    return {
      found: true,
      selected: true,
      reason: selected.selectionReason,
      details: {
        teams: selected.teams,
        status: selected.status,
        dataAvailability: selected.dataAvailability,
        limitations: selected.limitations
      }
    }
  }

  const skipped = discovery.skipped.find(f => f.fixtureId === fixtureId)
  if (skipped) {
    return {
      found: true,
      selected: false,
      reason: skipped.reason,
      details: null
    }
  }

  return {
    found: false,
    selected: false,
    reason: 'Fixture not found in current ESPN live feed',
    details: null
  }
}