/**
 * Match curation layer — separates priority leagues, main matches,
 * and secondary leagues for editorial presentation.
 */

import { getMatchImportanceScore } from '@/utils/matchImportance'

// ─── Types ───────────────────────────────────────────────────────────────────

interface CurationMatch {
  id: number
  competition: { name: string; emblem: string | null }
  homeTeam: { id: number; name: string; crest: string | null; shortName: string }
  awayTeam: { id: number; name: string; crest: string | null; shortName: string }
  score: { fullTime: { home: number | null; away: number | null } }
  status: string
  utcDate: string
  matchday: number
  area?: { name: string }
  [key: string]: any
}

export interface CompetitionGroup {
  name: string
  emblem: string | null
  country: string
  matches: CurationMatch[]
  hasLive: boolean
  hasFavorite: boolean
  maxImportance: number
}

export interface CuratedMatches {
  mainMatches: CurationMatch[]
  priorityLeagues: CompetitionGroup[]
  secondaryLeagues: CompetitionGroup[]
  liveMatches: CurationMatch[]
  soonMatches: CurationMatch[]
  favoriteMatches: CurationMatch[]
  finishedMatches: CurationMatch[]
  allGroups: CompetitionGroup[]
}

// ─── Priority leagues ────────────────────────────────────────────────────────

const PRIORITY_LEAGUE_KEYWORDS = [
  'premier league', 'brasileirão', 'brasileiro', 'série a', 'serie a',
  'laliga', 'la liga', 'primera division', 'bundesliga', 'ligue 1',
  'champions league', 'libertadores', 'copa do brasil', 'europa league',
]

function isPriorityLeague(name: string): boolean {
  const lower = name.toLowerCase()
  return PRIORITY_LEAGUE_KEYWORDS.some(k => lower.includes(k))
}

// ─── Status helpers ──────────────────────────────────────────────────────────

function isLive(status: string): boolean {
  return status === 'IN_PLAY' || status === 'LIVE' || status === 'PAUSED'
}

function isFinished(status: string): boolean {
  return status === 'FINISHED'
}

function isScheduled(status: string): boolean {
  return status === 'TIMED' || status === 'SCHEDULED'
}

function isSoon(m: CurationMatch): boolean {
  if (!isScheduled(m.status)) return false
  const diff = Math.round((new Date(m.utcDate).getTime() - Date.now()) / 60000)
  return diff > 0 && diff <= 60
}

// ─── Main curation function ──────────────────────────────────────────────────

export function curateMatches(
  matches: CurationMatch[],
  isFavoriteTeam: (name: string) => boolean = () => false,
  isFavoriteMatch: (id: string) => boolean = () => false,
  isFavoriteLeague: (name: string) => boolean = () => false,
): CuratedMatches {
  // Categorize matches
  const liveMatches = matches.filter(m => isLive(m.status))
  const soonMatches = matches.filter(m => isSoon(m))
  const finishedMatches = matches.filter(m => isFinished(m.status))
  const favoriteMatches = matches.filter(m =>
    isFavoriteTeam(m.homeTeam.shortName || m.homeTeam.name) ||
    isFavoriteTeam(m.awayTeam.shortName || m.awayTeam.name) ||
    isFavoriteLeague(m.competition.name)
  )

  // Main matches: top 6 by importance
  const mainMatches = [...matches]
    .sort((a, b) => getMatchImportanceScore(b) - getMatchImportanceScore(a))
    .slice(0, 6)

  // Group by competition
  const groupMap = new Map<string, CompetitionGroup>()
  for (const m of matches) {
    const key = m.competition.name
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        name: key,
        emblem: m.competition.emblem,
        country: m.area?.name || '',
        matches: [],
        hasLive: false,
        hasFavorite: false,
        maxImportance: 0,
      })
    }
    const group = groupMap.get(key)!
    group.matches.push(m)
    if (isLive(m.status)) group.hasLive = true
    if (isFavoriteTeam(m.homeTeam.shortName || m.homeTeam.name) || isFavoriteTeam(m.awayTeam.shortName || m.awayTeam.name)) group.hasFavorite = true
    const imp = getMatchImportanceScore(m)
    if (imp > group.maxImportance) group.maxImportance = imp
  }

  // Sort matches within each group
  for (const group of groupMap.values()) {
    group.matches.sort((a, b) => {
      // Live first
      if (isLive(a.status) && !isLive(b.status)) return -1
      if (!isLive(a.status) && isLive(b.status)) return 1
      // Soon second
      if (isSoon(a) && !isSoon(b)) return -1
      if (!isSoon(a) && isSoon(b)) return 1
      // Finished last
      if (isFinished(a.status) && !isFinished(b.status)) return 1
      if (!isFinished(a.status) && isFinished(b.status)) return -1
      // By importance
      return getMatchImportanceScore(b) - getMatchImportanceScore(a)
    })
  }

  // Split into priority and secondary
  const allGroups = Array.from(groupMap.values())
  const priorityLeagues: CompetitionGroup[] = []
  const secondaryLeagues: CompetitionGroup[] = []

  // Sort groups by editorial priority
  allGroups.sort((a, b) => {
    // Favorites with live first
    if (a.hasFavorite && a.hasLive && !(b.hasFavorite && b.hasLive)) return -1
    if (b.hasFavorite && b.hasLive && !(a.hasFavorite && a.hasLive)) return 1
    // Live leagues
    if (a.hasLive && !b.hasLive) return -1
    if (!a.hasLive && b.hasLive) return 1
    // Priority leagues
    const aPriority = isPriorityLeague(a.name)
    const bPriority = isPriorityLeague(b.name)
    if (aPriority && !bPriority) return -1
    if (!aPriority && bPriority) return 1
    // Favorites
    if (a.hasFavorite && !b.hasFavorite) return -1
    if (!a.hasFavorite && b.hasFavorite) return 1
    // By max importance
    return b.maxImportance - a.maxImportance
  })

  for (const group of allGroups) {
    if (isPriorityLeague(group.name) || group.hasLive || group.hasFavorite || group.maxImportance >= 80) {
      priorityLeagues.push(group)
    } else {
      secondaryLeagues.push(group)
    }
  }

  if (import.meta.env.DEV) {
    console.info('[matches-curation]', {
      total: matches.length,
      main: mainMatches.length,
      priorityLeagues: priorityLeagues.length,
      secondaryLeagues: secondaryLeagues.length,
      live: liveMatches.length,
      soon: soonMatches.length,
      favorites: favoriteMatches.length,
      finished: finishedMatches.length,
    })
  }

  return { mainMatches, priorityLeagues, secondaryLeagues, liveMatches, soonMatches, favoriteMatches, finishedMatches, allGroups }
}
