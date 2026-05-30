/**
 * Deduplicates matches from multiple providers.
 * Uses team name normalization + time proximity + competition matching.
 */

import { normalizeTeamName } from '@/features/providers/teamNameNormalizer'
import { getStatusPrecedence } from '@/lib/matchesClassification'

// ─── Additional aliases for dedup (supplements teamNameNormalizer) ────────────

const DEDUP_ALIASES: Record<string, string> = {
  'atleti': 'atletico madrid',
  'atletico de madrid': 'atletico madrid',
  'atl madrid': 'atletico madrid',
  'atl. madrid': 'atletico madrid',
  'brighton hove': 'brighton',
  'brighton & hove albion': 'brighton',
  'brighton hove albion': 'brighton',
  'wolverhampton wanderers': 'wolverhampton',
  'wolves': 'wolverhampton',
  'man city': 'manchester city',
  'manchester city fc': 'manchester city',
  'man united': 'manchester united',
  'man utd': 'manchester united',
  'manchester united fc': 'manchester united',
  'athletico pr': 'athletico paranaense',
  'ath paranaense': 'athletico paranaense',
  'red bull bragantino': 'bragantino',
  'rb bragantino': 'bragantino',
  'ac milan': 'milan',
  'as roma': 'roma',
  'hellas verona': 'verona',
  'internazionale': 'inter',
  'inter milan': 'inter',
  'fc internazionale': 'inter',
  'tottenham hotspur': 'tottenham',
  'spurs': 'tottenham',
  'newcastle united': 'newcastle',
  'newcastle utd': 'newcastle',
  'west ham united': 'west ham',
  'borussia dortmund': 'dortmund',
  'bvb': 'dortmund',
  'paris saint-germain': 'psg',
  'paris saint germain': 'psg',
  'paris saint-germain fc': 'psg',
  'paris s-g': 'psg',
  'real sociedad ii': 'real sociedad b',
  'bayern munich': 'bayern',
  'bayern munchen': 'bayern',
  'fc bayern munchen': 'bayern',
  'nottingham forest': 'nott forest',
  'nott\'m forest': 'nott forest',
}

function dedupNormalize(name: string): string {
  const base = normalizeTeamName(name)
  return DEDUP_ALIASES[base] || base
}

function teamsMatch(homeA: string, awayA: string, homeB: string, awayB: string): boolean {
  const hA = dedupNormalize(homeA)
  const aA = dedupNormalize(awayA)
  const hB = dedupNormalize(homeB)
  const aB = dedupNormalize(awayB)

  // Direct match
  if (hA === hB && aA === aB) return true

  // Inverted (rare but possible)
  if (hA === aB && aA === hB) return true

  // Contains (one name contains the other fully)
  if (hA.length >= 4 && hB.length >= 4 && aA.length >= 4 && aB.length >= 4) {
    const homeMatch = hA === hB || hA.startsWith(hB) || hB.startsWith(hA)
    const awayMatch = aA === aB || aA.startsWith(aB) || aB.startsWith(aA)
    if (homeMatch && awayMatch) return true
  }

  return false
}

function timeClose(dateA: string, dateB: string, maxMinutes: number): boolean {
  try {
    const tA = new Date(dateA).getTime()
    const tB = new Date(dateB).getTime()
    if (isNaN(tA) || isNaN(tB)) return true // can't compare, assume same
    return Math.abs(tA - tB) <= maxMinutes * 60_000
  } catch { return true }
}

// ─── Match item interface (minimal for dedup) ────────────────────────────────

interface DedupMatch {
  id: number
  homeTeam: { name: string; shortName?: string; crest?: string | null }
  awayTeam: { name: string; shortName?: string; crest?: string | null }
  competition: { name: string; emblem?: string | null }
  status: string
  utcDate: string
  score: { fullTime: { home: number | null; away: number | null } }
  area?: { name: string }
  matchday?: number
  [key: string]: any
}

function getMatchRichness(m: DedupMatch): number {
  let score = 0
  if (m.homeTeam.crest) score += 2
  if (m.awayTeam.crest) score += 2
  if (m.competition.emblem) score += 1
  // Status advancement: use canonical precedence. Higher precedence = more valuable.
  const precedence = getStatusPrecedence(m.status)
  if (precedence >= 500) score += 5  // live
  else if (precedence >= 400) score += 4  // finished
  if (m.score.fullTime.home !== null && m.score.fullTime.home > 0) score += 2
  if (m.score.fullTime.away !== null && m.score.fullTime.away > 0) score += 2
  if ((m.homeTeam.shortName || m.homeTeam.name).length > 10) score += 1
  return score
}

export function dedupeMatches<T extends DedupMatch>(matches: T[]): T[] {
  if (matches.length <= 1) return matches

  const kept: T[] = []
  const removed = new Set<number>()

  for (let i = 0; i < matches.length; i++) {
    if (removed.has(i)) continue

    let best = matches[i]
    let bestIdx = i

    for (let j = i + 1; j < matches.length; j++) {
      if (removed.has(j)) continue

      const a = best
      const b = matches[j]

      const homeA = a.homeTeam.shortName || a.homeTeam.name
      const awayA = a.awayTeam.shortName || a.awayTeam.name
      const homeB = b.homeTeam.shortName || b.homeTeam.name
      const awayB = b.awayTeam.shortName || b.awayTeam.name

      if (!teamsMatch(homeA, awayA, homeB, awayB)) continue

      // Check time proximity
      const aPrecedence = getStatusPrecedence(a.status)
      const bPrecedence = getStatusPrecedence(b.status)
      const maxMin = (aPrecedence >= 400 || bPrecedence >= 400) ? 180 : 90
      if (!timeClose(a.utcDate, b.utcDate, maxMin)) continue

      // Duplicate found — pick best
      const scoreA = getMatchRichness(a)
      const scoreB = getMatchRichness(b)

      if (import.meta.env.DEV) {
        console.groupCollapsed('[matches-dedup] duplicate found')
        console.log({ kept: `${homeA} x ${awayA}`, removed: `${homeB} x ${awayB}`, scoreA, scoreB })
        console.groupEnd()
      }

      if (scoreB > scoreA) {
        // B is better — merge logos from A into B if B is missing them
        if (!b.homeTeam.crest && a.homeTeam.crest) (b.homeTeam as any).crest = a.homeTeam.crest
        if (!b.awayTeam.crest && a.awayTeam.crest) (b.awayTeam as any).crest = a.awayTeam.crest
        if (!b.competition.emblem && a.competition.emblem) (b.competition as any).emblem = a.competition.emblem
        // Preserve more advanced status from A if B is less advanced
        if (aPrecedence > bPrecedence) (b as any).status = a.status
        // Preserve score from A if B has no score
        if (a.score.fullTime.home !== null && b.score.fullTime.home === null) (b as any).score = a.score
        removed.add(bestIdx)
        best = b
        bestIdx = j
      } else {
        // A is better — merge logos from B
        if (!a.homeTeam.crest && b.homeTeam.crest) (a.homeTeam as any).crest = b.homeTeam.crest
        if (!a.awayTeam.crest && b.awayTeam.crest) (a.awayTeam as any).crest = b.awayTeam.crest
        if (!a.competition.emblem && b.competition.emblem) (a.competition as any).emblem = b.competition.emblem
        // Preserve more advanced status from B if A is less advanced
        if (bPrecedence > aPrecedence) (a as any).status = b.status
        // Preserve score from B if A has no score
        if (b.score.fullTime.home !== null && a.score.fullTime.home === null) (a as any).score = b.score
        removed.add(j)
      }
    }

    if (!removed.has(bestIdx)) {
      kept.push(best)
      removed.add(bestIdx)
    }
  }

  if (import.meta.env.DEV && matches.length !== kept.length) {
    console.info('[matches-dedup]', { before: matches.length, after: kept.length, removed: matches.length - kept.length })
  }

  return kept
}

// ─── Competition normalization ───────────────────────────────────────────────

const COMPETITION_NORMALIZE: Record<string, string> = {
  'english premier league': 'Premier League',
  'italian serie a': 'Serie A',
  'spanish laliga': 'LaLiga',
  'spanish laliga 2': 'LaLiga 2',
  '2026 brasileiro serie a': 'Brasileirão Série A',
  'brasileiro serie a': 'Brasileirão Série A',
  'campeonato brasileiro série a': 'Brasileirão Série A',
  '2026 brasileirao serie a': 'Brasileirão Série A',
  'brasileiro serie b': 'Brasileirão Série B',
  '2026 brasileiro serie b': 'Brasileirão Série B',
  '2026 allsvenskan': 'Allsvenskan',
  '2026 eliteserien': 'Eliteserien',
  '2026 chinese super league': 'Chinese Super League',
  '2026 primera division de chile': 'Primera División Chile',
  'regular season': 'Regular Season',
  'english championship': 'Championship',
  'french ligue 1': 'Ligue 1',
  'german bundesliga': 'Bundesliga',
  'dutch eredivisie': 'Eredivisie',
  'portuguese primeira liga': 'Liga Portugal',
  'scottish premiership': 'Scottish Premiership',
  'turkish super lig': 'Süper Lig',
  'belgian pro league': 'Pro League',
  'argentine primera division': 'Primera División Argentina',
  'colombian primera a': 'Liga BetPlay',
  'mexican liga mx': 'Liga MX',
  'uruguayan primera division': 'Primera División Uruguay',
  'paraguayan primera division': 'Primera División Paraguay',
  'peruvian primera division': 'Liga 1 Perú',
  'chilean primera division': 'Primera División Chile',
}

export function normalizeCompetitionName(name: string): string {
  const lower = name.toLowerCase().trim()
  if (COMPETITION_NORMALIZE[lower]) return COMPETITION_NORMALIZE[lower]
  // Remove year prefix
  const withoutYear = lower.replace(/^\d{4}\s+/, '')
  if (COMPETITION_NORMALIZE[withoutYear]) return COMPETITION_NORMALIZE[withoutYear]
  // If "Regular Season", keep original
  if (lower === 'regular season') return name
  return name
}
