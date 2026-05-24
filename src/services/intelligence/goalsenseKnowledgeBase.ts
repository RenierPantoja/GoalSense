/**
 * GoalSense Knowledge Base — progressive local data accumulation.
 * Records fixture snapshots and builds team profiles over time.
 * Uses localStorage in MVP, ready for Firebase migration.
 */
import { getCache, setCache, CACHE_TTL } from '../cache/goalsenseCache'
import { cacheKeys } from '../cache/cacheKeys'

export interface TeamKnowledgeProfile {
  teamId: number
  teamName: string
  matchesTracked: number
  goalsFor: number
  goalsAgainst: number
  avgGoalsFor: number
  avgGoalsAgainst: number
  avgShots: number
  avgShotsOnTarget: number
  avgCorners: number
  avgCards: number
  homeSamples: number
  awaySamples: number
  lastUpdated: string
}

interface FixtureSnapshot {
  fixtureId: number
  homeTeam: string
  awayTeam: string
  homeScore: number
  awayScore: number
  league: string
  date: string
  stats?: {
    possession?: { home: number; away: number }
    shots?: { home: number; away: number }
    shotsOnTarget?: { home: number; away: number }
    corners?: { home: number; away: number }
    cards?: { home: number; away: number }
  }
}

export function getTeamProfile(teamId: number): TeamKnowledgeProfile | null {
  const cached = getCache<TeamKnowledgeProfile>(cacheKeys.knowledgeProfile(teamId))
  return cached?.value || null
}

export function recordFinishedFixture(
  teamId: number,
  teamName: string,
  isHome: boolean,
  snapshot: FixtureSnapshot
): void {
  const existing = getTeamProfile(teamId) || createEmptyProfile(teamId, teamName)

  const gf = isHome ? snapshot.homeScore : snapshot.awayScore
  const ga = isHome ? snapshot.awayScore : snapshot.homeScore

  existing.matchesTracked++
  existing.goalsFor += gf
  existing.goalsAgainst += ga
  existing.avgGoalsFor = Math.round((existing.goalsFor / existing.matchesTracked) * 10) / 10
  existing.avgGoalsAgainst = Math.round((existing.goalsAgainst / existing.matchesTracked) * 10) / 10

  if (isHome) existing.homeSamples++
  else existing.awaySamples++

  if (snapshot.stats) {
    const shots = isHome ? (snapshot.stats.shots?.home || 0) : (snapshot.stats.shots?.away || 0)
    const sot = isHome ? (snapshot.stats.shotsOnTarget?.home || 0) : (snapshot.stats.shotsOnTarget?.away || 0)
    const corners = isHome ? (snapshot.stats.corners?.home || 0) : (snapshot.stats.corners?.away || 0)
    const cards = isHome ? (snapshot.stats.cards?.home || 0) : (snapshot.stats.cards?.away || 0)

    // Running average
    const n = existing.matchesTracked
    existing.avgShots = Math.round(((existing.avgShots * (n - 1) + shots) / n) * 10) / 10
    existing.avgShotsOnTarget = Math.round(((existing.avgShotsOnTarget * (n - 1) + sot) / n) * 10) / 10
    existing.avgCorners = Math.round(((existing.avgCorners * (n - 1) + corners) / n) * 10) / 10
    existing.avgCards = Math.round(((existing.avgCards * (n - 1) + cards) / n) * 10) / 10
  }

  existing.lastUpdated = new Date().toISOString()
  setCache(cacheKeys.knowledgeProfile(teamId), existing, CACHE_TTL.KNOWLEDGE_PROFILE, 'goalsense_kb')
}

function createEmptyProfile(teamId: number, teamName: string): TeamKnowledgeProfile {
  return { teamId, teamName, matchesTracked: 0, goalsFor: 0, goalsAgainst: 0, avgGoalsFor: 0, avgGoalsAgainst: 0, avgShots: 0, avgShotsOnTarget: 0, avgCorners: 0, avgCards: 0, homeSamples: 0, awaySamples: 0, lastUpdated: new Date().toISOString() }
}
