/**
 * GoalSense Knowledge Base — progressive local data accumulation.
 * Records fixture snapshots and builds team profiles over time.
 * Idempotent, safe, non-blocking. localStorage MVP, Firebase-ready interface.
 */
import { getCache, setCache, CACHE_TTL } from '../cache/goalsenseCache'
import { cacheKeys } from '../cache/cacheKeys'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface KnowledgeMatchSample {
  canonicalMatchId: string
  date: string
  competition: string
  opponent: string
  venue: 'home' | 'away'
  scored: number
  conceded: number
  result: 'win' | 'draw' | 'loss'
  cornersFor?: number
  cornersAgainst?: number
  cardsFor?: number
  cardsAgainst?: number
  shots?: number
  shotsOnTarget?: number
  possession?: number
  provider: string
}

export interface TeamKnowledgeProfile {
  teamId?: number
  teamName: string
  normalizedName: string
  samples: number
  homeSamples: number
  awaySamples: number
  goalsForAvg: number
  goalsAgainstAvg: number
  homeGoalsForAvg: number
  homeGoalsAgainstAvg: number
  awayGoalsForAvg: number
  awayGoalsAgainstAvg: number
  cornersForAvg: number
  cornersAgainstAvg: number
  cardsForAvg: number
  cardsAgainstAvg: number
  shotsAvg: number
  shotsOnTargetAvg: number
  possessionAvg: number
  bothTeamsScoredRate: number
  over15Rate: number
  over25Rate: number
  cleanSheetRate: number
  failedToScoreRate: number
  recentMatches: KnowledgeMatchSample[]
  updatedAt: string
}

interface FixtureInput {
  fixtureId?: number
  canonicalMatchId: string
  provider: string
  competition: string
  date: string
  homeTeam: string
  awayTeam: string
  homeScore: number
  awayScore: number
  homeTeamId?: number
  awayTeamId?: number
  stats?: {
    possession?: { home: number; away: number }
    shots?: { home: number; away: number }
    shotsOnTarget?: { home: number; away: number }
    corners?: { home: number; away: number }
    cards?: { home: number; away: number }
  }
}

// ─── Constants ───────────────────────────────────────────────────────────────

const KB_PREFIX = 'gs_kb_'
const MAX_RECENT_MATCHES = 20

function normalize(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
}

function getProfileKey(teamName: string): string {
  return `${KB_PREFIX}${normalize(teamName)}`
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function getTeamProfile(teamIdOrName: number | string): TeamKnowledgeProfile | null {
  const key = typeof teamIdOrName === 'number' ? cacheKeys.knowledgeProfile(teamIdOrName) : getProfileKey(String(teamIdOrName))
  const cached = getCache<TeamKnowledgeProfile>(key)
  return cached?.value || null
}

export function hasEnoughKnowledge(teamName: string, minSamples = 3): boolean {
  const profile = getTeamProfile(teamName)
  return profile !== null && profile.samples >= minSamples
}

export function getTeamKnowledgeSummary(teamName: string): string {
  const profile = getTeamProfile(teamName)
  if (!profile || profile.samples < 3) return 'Base GoalSense insuficiente'
  return `Base GoalSense · ${profile.samples} jogos registrados`
}

/**
 * Record a finished fixture into the knowledge base.
 * Idempotent: won't duplicate if same canonicalMatchId already recorded.
 */
export function recordFinishedFixture(input: FixtureInput): void {
  try {
    // Record for home team
    updateTeamProfile(input.homeTeam, input.homeTeamId, {
      canonicalMatchId: input.canonicalMatchId,
      date: input.date,
      competition: input.competition,
      opponent: input.awayTeam,
      venue: 'home',
      scored: input.homeScore,
      conceded: input.awayScore,
      result: input.homeScore > input.awayScore ? 'win' : input.homeScore < input.awayScore ? 'loss' : 'draw',
      cornersFor: input.stats?.corners?.home,
      cornersAgainst: input.stats?.corners?.away,
      cardsFor: input.stats?.cards?.home,
      cardsAgainst: input.stats?.cards?.away,
      shots: input.stats?.shots?.home,
      shotsOnTarget: input.stats?.shotsOnTarget?.home,
      possession: input.stats?.possession?.home,
      provider: input.provider,
    })

    // Record for away team
    updateTeamProfile(input.awayTeam, input.awayTeamId, {
      canonicalMatchId: input.canonicalMatchId,
      date: input.date,
      competition: input.competition,
      opponent: input.homeTeam,
      venue: 'away',
      scored: input.awayScore,
      conceded: input.homeScore,
      result: input.awayScore > input.homeScore ? 'win' : input.awayScore < input.homeScore ? 'loss' : 'draw',
      cornersFor: input.stats?.corners?.away,
      cornersAgainst: input.stats?.corners?.home,
      cardsFor: input.stats?.cards?.away,
      cardsAgainst: input.stats?.cards?.home,
      shots: input.stats?.shots?.away,
      shotsOnTarget: input.stats?.shotsOnTarget?.away,
      possession: input.stats?.possession?.away,
      provider: input.provider,
    })
  } catch {
    if (import.meta.env.DEV) console.warn('[KB] Failed to record fixture')
  }
}

// ─── Internal ────────────────────────────────────────────────────────────────

function updateTeamProfile(teamName: string, teamId: number | undefined, sample: KnowledgeMatchSample): void {
  const key = getProfileKey(teamName)
  const existing = getCache<TeamKnowledgeProfile>(key)?.value || createEmpty(teamName, teamId)

  // Idempotent: check if already recorded
  if (existing.recentMatches.some(m => m.canonicalMatchId === sample.canonicalMatchId)) return

  // Add sample
  existing.recentMatches = [sample, ...existing.recentMatches].slice(0, MAX_RECENT_MATCHES)
  existing.samples++
  if (sample.venue === 'home') existing.homeSamples++
  else existing.awaySamples++

  // Recalculate averages from recent matches
  const matches = existing.recentMatches
  const n = matches.length

  existing.goalsForAvg = round(matches.reduce((s, m) => s + m.scored, 0) / n)
  existing.goalsAgainstAvg = round(matches.reduce((s, m) => s + m.conceded, 0) / n)

  const homeMatches = matches.filter(m => m.venue === 'home')
  const awayMatches = matches.filter(m => m.venue === 'away')
  existing.homeGoalsForAvg = homeMatches.length > 0 ? round(homeMatches.reduce((s, m) => s + m.scored, 0) / homeMatches.length) : 0
  existing.homeGoalsAgainstAvg = homeMatches.length > 0 ? round(homeMatches.reduce((s, m) => s + m.conceded, 0) / homeMatches.length) : 0
  existing.awayGoalsForAvg = awayMatches.length > 0 ? round(awayMatches.reduce((s, m) => s + m.scored, 0) / awayMatches.length) : 0
  existing.awayGoalsAgainstAvg = awayMatches.length > 0 ? round(awayMatches.reduce((s, m) => s + m.conceded, 0) / awayMatches.length) : 0

  const withCorners = matches.filter(m => m.cornersFor !== undefined)
  existing.cornersForAvg = withCorners.length > 0 ? round(withCorners.reduce((s, m) => s + (m.cornersFor || 0), 0) / withCorners.length) : 0
  existing.cornersAgainstAvg = withCorners.length > 0 ? round(withCorners.reduce((s, m) => s + (m.cornersAgainst || 0), 0) / withCorners.length) : 0

  const withCards = matches.filter(m => m.cardsFor !== undefined)
  existing.cardsForAvg = withCards.length > 0 ? round(withCards.reduce((s, m) => s + (m.cardsFor || 0), 0) / withCards.length) : 0
  existing.cardsAgainstAvg = withCards.length > 0 ? round(withCards.reduce((s, m) => s + (m.cardsAgainst || 0), 0) / withCards.length) : 0

  const withShots = matches.filter(m => m.shots !== undefined)
  existing.shotsAvg = withShots.length > 0 ? round(withShots.reduce((s, m) => s + (m.shots || 0), 0) / withShots.length) : 0
  existing.shotsOnTargetAvg = withShots.length > 0 ? round(withShots.reduce((s, m) => s + (m.shotsOnTarget || 0), 0) / withShots.length) : 0

  const withPoss = matches.filter(m => m.possession !== undefined && m.possession > 0)
  existing.possessionAvg = withPoss.length > 0 ? round(withPoss.reduce((s, m) => s + (m.possession || 0), 0) / withPoss.length) : 0

  existing.bothTeamsScoredRate = round(matches.filter(m => m.scored > 0 && m.conceded > 0).length / n * 100)
  existing.over15Rate = round(matches.filter(m => m.scored + m.conceded > 1).length / n * 100)
  existing.over25Rate = round(matches.filter(m => m.scored + m.conceded > 2).length / n * 100)
  existing.cleanSheetRate = round(matches.filter(m => m.conceded === 0).length / n * 100)
  existing.failedToScoreRate = round(matches.filter(m => m.scored === 0).length / n * 100)

  existing.updatedAt = new Date().toISOString()
  if (teamId) existing.teamId = teamId

  setCache(key, existing, CACHE_TTL.KNOWLEDGE_PROFILE, 'goalsense_kb')
}

function createEmpty(teamName: string, teamId?: number): TeamKnowledgeProfile {
  return { teamId, teamName, normalizedName: normalize(teamName), samples: 0, homeSamples: 0, awaySamples: 0, goalsForAvg: 0, goalsAgainstAvg: 0, homeGoalsForAvg: 0, homeGoalsAgainstAvg: 0, awayGoalsForAvg: 0, awayGoalsAgainstAvg: 0, cornersForAvg: 0, cornersAgainstAvg: 0, cardsForAvg: 0, cardsAgainstAvg: 0, shotsAvg: 0, shotsOnTargetAvg: 0, possessionAvg: 0, bothTeamsScoredRate: 0, over15Rate: 0, over25Rate: 0, cleanSheetRate: 0, failedToScoreRate: 0, recentMatches: [], updatedAt: new Date().toISOString() }
}

function round(n: number): number { return Math.round(n * 10) / 10 }
