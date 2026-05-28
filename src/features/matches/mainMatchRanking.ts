/**
 * mainMatchRanking — intelligent scoring for the "Principais" filter.
 * -----------------------------------------------------------------------------
 * Combines club popularity, competition strength, tournament phase, match
 * status, user favorites, and data coverage into a single score that
 * determines which matches are the most important of the day.
 *
 * No mocks. No invented data. No API calls.
 */

import { normalizeTeamName } from '@/features/providers/teamNameNormalizer'
import { classifyMatch } from '@/lib/matchesClassification'

// --- Types ----------------------------------------------------------------

export interface MainMatchScore {
  score: number
  tier: 'global_elite' | 'major' | 'regional_strong' | 'regular' | 'low'
  reasons: string[]
}

export interface RankingContext {
  isFavoriteTeam?: (name: string) => boolean
  isFavoriteMatch?: (id: string) => boolean
}

// --- Club tiers -----------------------------------------------------------

const ELITE_CLUBS = new Set([
  'real madrid', 'barcelona', 'manchester united', 'manchester city',
  'liverpool', 'arsenal', 'chelsea', 'tottenham', 'bayern', 'bayern munich',
  'borussia dortmund', 'dortmund', 'psg', 'paris saint-germain', 'juventus',
  'milan', 'ac milan', 'inter', 'internazionale', 'napoli', 'roma',
  'atletico madrid', 'atletico de madrid', 'benfica', 'porto', 'sporting',
  'ajax', 'psv',
])

const BRAZIL_STRONG = new Set([
  'flamengo', 'palmeiras', 'corinthians', 'sao paulo', 'são paulo',
  'santos', 'vasco', 'vasco da gama', 'botafogo', 'fluminense',
  'gremio', 'grêmio', 'internacional', 'cruzeiro', 'atletico-mg',
  'atlético-mg', 'atletico mineiro', 'atlético mineiro', 'bahia',
  'athletico-pr', 'athletico paranaense', 'fortaleza', 'sport', 'ceara',
])

const SOUTH_AMERICA_STRONG = new Set([
  'boca juniors', 'river plate', 'independiente', 'racing', 'racing club',
  'san lorenzo', 'estudiantes', 'velez sarsfield', 'vélez sarsfield',
  'peñarol', 'penarol', 'nacional', 'colo-colo', 'colo colo',
  'universidad de chile', 'universidad catolica', 'olimpia',
  'cerro porteño', 'cerro porteno', 'libertad', 'ldu quito',
  'liga de quito', 'independiente del valle', 'atletico nacional',
  'millonarios', 'america de cali', 'deportivo cali',
])

const MEXICO_MLS_STRONG = new Set([
  'club america', 'america', 'chivas', 'guadalajara', 'cruz azul',
  'pumas', 'pumas unam', 'tigres', 'monterrey', 'inter miami',
  'lafc', 'la galaxy', 'seattle sounders', 'atlanta united',
  'new york city', 'new york red bulls',
])

const OTHER_NOTABLE = new Set([
  'galatasaray', 'fenerbahce', 'fenerbahçe', 'besiktas', 'beşiktaş',
  'celtic', 'rangers', 'al hilal', 'al nassr', 'al ittihad', 'al ahly',
  'olympique marseille', 'marseille', 'lyon', 'newcastle', 'west ham',
  'aston villa', 'brighton', 'nottingham forest', 'wolves', 'wolverhampton',
  'lazio', 'atalanta', 'fiorentina', 'sevilla', 'real betis',
  'real sociedad', 'athletic club', 'villarreal', 'valencia',
  'rb leipzig', 'bayer leverkusen', 'leverkusen', 'eintracht frankfurt',
])

function getClubScore(teamName: string): number {
  const normalized = normalizeTeamName(teamName)
  if (ELITE_CLUBS.has(normalized)) return 35
  if (BRAZIL_STRONG.has(normalized)) return 28
  if (SOUTH_AMERICA_STRONG.has(normalized)) return 22
  if (MEXICO_MLS_STRONG.has(normalized)) return 18
  if (OTHER_NOTABLE.has(normalized)) return 15
  return 0
}

// --- Competition tiers ----------------------------------------------------

const ELITE_COMPETITIONS = new Set([
  'champions league', 'uefa champions league',
  'premier league', 'la liga', 'laliga', 'serie a', 'bundesliga', 'ligue 1',
  'europa league', 'uefa europa league', 'conference league',
])

const STRONG_COMPETITIONS = new Set([
  'brasileirão série a', 'brasileirao serie a', 'campeonato brasileiro série a',
  'copa do brasil', 'copa libertadores', 'libertadores',
  'copa sudamericana', 'sul-americana', 'recopa sul-americana',
  'fa cup', 'copa del rey', 'coppa italia', 'dfb pokal', 'coupe de france',
  'eredivisie', 'primeira liga', 'liga portugal',
  'argentina primera', 'liga profesional', 'primera division argentina',
  'liga mx', 'mls', 'major league soccer',
  'scottish premiership', 'super lig', 'süper lig',
  'saudi pro league', 'world cup', 'euro', 'copa america',
  'nations league', 'club world cup',
])

const MEDIUM_COMPETITIONS = new Set([
  'brasileirão série b', 'serie b brazil', 'championship', 'efl championship',
  'segunda division', 'la liga 2', 'serie b', '2. bundesliga', 'ligue 2',
  'copa argentina', 'uruguayan primera', 'chilean primera',
  'colombian primera', 'ecuadorian primera', 'paraguayan primera',
])

function getCompetitionScore(compName: string): number {
  const lower = compName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  for (const c of ELITE_COMPETITIONS) if (lower.includes(c)) return 20
  for (const c of STRONG_COMPETITIONS) if (lower.includes(c)) return 14
  for (const c of MEDIUM_COMPETITIONS) if (lower.includes(c)) return 8
  // Friendlies penalized
  if (lower.includes('friendly') || lower.includes('amistoso')) return 2
  return 4
}

// --- Phase detection ------------------------------------------------------

function getPhaseBonus(compName: string, matchday?: number): number {
  const lower = compName.toLowerCase()
  if (lower.includes('final')) return 18
  if (lower.includes('semifinal') || lower.includes('semi-final')) return 14
  if (lower.includes('quarterfinal') || lower.includes('quarter-final')) return 10
  if (lower.includes('playoff') || lower.includes('play-off')) return 8
  if (lower.includes('knockout')) return 8
  if (lower.includes('derby') || lower.includes('clásico') || lower.includes('classico')) return 6
  return 0
}

// --- Main scoring function ------------------------------------------------

export function scoreMatchImportance(
  match: { homeTeam: { name: string; shortName?: string; crest?: string | null }; awayTeam: { name: string; shortName?: string; crest?: string | null }; competition: { name: string; emblem?: string | null }; status: string; utcDate: string; matchday?: number; state?: string },
  context: RankingContext = {},
): MainMatchScore {
  let score = 0
  const reasons: string[] = []

  // 1. Club scores (both teams contribute)
  const homeName = match.homeTeam.shortName || match.homeTeam.name
  const awayName = match.awayTeam.shortName || match.awayTeam.name
  const homeClubScore = getClubScore(homeName)
  const awayClubScore = getClubScore(awayName)
  const clubScore = homeClubScore + awayClubScore

  if (homeClubScore >= 35 || awayClubScore >= 35) reasons.push('Clube global de elite')
  else if (homeClubScore >= 28 || awayClubScore >= 28) reasons.push('Grande clube brasileiro')
  else if (homeClubScore >= 22 || awayClubScore >= 22) reasons.push('Clube forte sul-americano')
  else if (homeClubScore >= 15 || awayClubScore >= 15) reasons.push('Clube relevante')

  // Both teams strong = classic/derby bonus
  if (homeClubScore >= 22 && awayClubScore >= 22) {
    score += 10
    reasons.push('Confronto entre grandes')
  }

  score += clubScore

  // 2. Competition
  const compScore = getCompetitionScore(match.competition.name)
  score += compScore
  if (compScore >= 20) reasons.push('Liga de elite')
  else if (compScore >= 14) reasons.push('Competição forte')

  // 3. Phase
  const phaseBonus = getPhaseBonus(match.competition.name, match.matchday)
  score += phaseBonus
  if (phaseBonus >= 14) reasons.push('Fase decisiva')
  else if (phaseBonus >= 8) reasons.push('Fase eliminatória')

  // 4. Status
  const cls = classifyMatch(match)
  if (cls.isLive) { score += 12; reasons.push('Ao vivo') }
  else if (cls.isStartingSoon) { score += 8; reasons.push('Começa em breve') }
  else if (cls.isUpcoming) { score += 4 }
  else if (cls.isFinished) { score += 2 }
  else if (cls.isStaleScheduled) { score -= 5 }
  else if (cls.isCancelled || cls.isDelayed) { score -= 15 }

  // 5. Favorites
  if (context.isFavoriteTeam) {
    if (context.isFavoriteTeam(homeName) || context.isFavoriteTeam(awayName)) {
      score += 20
      reasons.push('Time favorito')
    }
  }

  // 6. Data coverage
  if (match.homeTeam.crest && match.awayTeam.crest) { score += 5 }
  else if (!match.homeTeam.crest && !match.awayTeam.crest) { score -= 8 }
  if (match.competition.emblem) { score += 2 }

  // Clamp
  score = Math.max(0, score)

  // Tier
  let tier: MainMatchScore['tier'] = 'low'
  if (score >= 65) tier = 'global_elite'
  else if (score >= 45) tier = 'major'
  else if (score >= 30) tier = 'regional_strong'
  else if (score >= 15) tier = 'regular'

  return { score, tier, reasons: reasons.slice(0, 4) }
}

/**
 * Sort matches by importance score (descending).
 * Returns top N matches above threshold, with a minimum of `minCount`.
 */
export function getMainMatches(
  matches: { homeTeam: { name: string; shortName?: string; crest?: string | null }; awayTeam: { name: string; shortName?: string; crest?: string | null }; competition: { name: string; emblem?: string | null }; status: string; utcDate: string; matchday?: number; state?: string }[],
  context: RankingContext = {},
  options: { maxCount?: number; minCount?: number; threshold?: number } = {},
): typeof matches {
  const { maxCount = 15, minCount = 6, threshold = 35 } = options

  const scored = matches.map(m => ({ match: m, score: scoreMatchImportance(m, context).score }))
  scored.sort((a, b) => b.score - a.score)

  // Take all above threshold, but at least minCount
  let result = scored.filter(s => s.score >= threshold)
  if (result.length < minCount) {
    result = scored.slice(0, minCount)
  }
  if (result.length > maxCount) {
    result = result.slice(0, maxCount)
  }

  return result.map(r => r.match)
}
