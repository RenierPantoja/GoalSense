/**
 * liveMatchRanking V2 — intelligent scoring for the Live Radar featured match.
 * -----------------------------------------------------------------------------
 * Club importance is the PRIMARY factor. A big club live always beats a small
 * club live, regardless of data coverage or provider.
 *
 * Score budget:
 *   - clubScore: up to ~140 (both teams combined)
 *   - competitionScore: up to 50
 *   - liveContextScore: up to 40
 *   - dramaScore: up to 35
 *   - favoriteScore: up to 30
 *   - coverageScore: up to 15
 *   - penalties: up to -60
 *
 * No API calls. No mocks. No invented data.
 */
import type { LiveFixture } from '@/lib/apiClient'
import type { FixtureStats } from './LiveScannerTable'

// --- Types ----------------------------------------------------------------

export interface FeaturedMatchScore {
  score: number
  reasons: string[]
  tier: 'elite' | 'high' | 'medium' | 'low'
}

export interface RankingOptions {
  isFavoriteTeam?: (name: string) => boolean
  stats?: FixtureStats
  /** When true, applies small-game penalty if big clubs are present */
  allFixtures?: LiveFixture[]
}

// --- Normalization --------------------------------------------------------

function norm(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['\-.~]/g, ' ').replace(/\s+/g, ' ').trim()
}

// --- Club tiers (keyword substring matching) ------------------------------

const TIER1_GLOBAL_ELITE: string[] = [
  'real madrid', 'barcelona', 'manchester united', 'manchester city',
  'liverpool', 'arsenal', 'chelsea', 'bayern', 'psg', 'paris saint',
  'juventus', 'borussia dortmund', 'dortmund', 'atletico madrid',
  'tottenham',
]

const TIER2_GIANTS: string[] = [
  'flamengo', 'palmeiras', 'corinthians', 'sao paulo', 'santos',
  'vasco', 'botafogo', 'fluminense', 'gremio', 'internacional',
  'cruzeiro', 'atletico mineiro', 'atletico mg',
  'river plate', 'boca juniors', 'ca independiente', 'racing club',
  'san lorenzo', 'estudiantes', 'velez',
  'penarol', 'peñarol', 'nacional',
  'colo colo', 'colo-colo', 'olimpia', 'cerro porteno',
  'libertad', 'ldu', 'liga de quito', 'atletico nacional',
  'america de cali', 'millonarios',
  'milan', 'ac milan', 'inter milan', 'internazionale', 'napoli', 'roma',
  'benfica', 'porto', 'sporting cp',
]

const TIER3_STRONG: string[] = [
  'bragantino', 'bahia', 'fortaleza', 'sport', 'athletico',
  'ceara', 'coritiba', 'goias', 'juventude', 'vitoria',
  'universidad de chile', 'universidad catolica',
  'independiente del valle', 'independiente santa fe',
  'independiente rivadavia', 'independiente petrolero',
  'cruz azul', 'pumas', 'club america', 'chivas', 'tigres', 'monterrey',
  'lafc', 'la galaxy', 'seattle sounders', 'inter miami',
  'ajax', 'psv', 'feyenoord', 'celtic', 'rangers',
  'galatasaray', 'fenerbahce', 'besiktas',
  'sevilla', 'valencia', 'villarreal', 'real sociedad', 'real betis',
  'lazio', 'atalanta', 'fiorentina',
  'marseille', 'lyon', 'monaco',
  'newcastle', 'west ham', 'aston villa', 'brighton',
  'leverkusen', 'leipzig', 'eintracht frankfurt',
]

// Ambiguous keywords that need word boundary matching to avoid false positives
const AMBIGUOUS_CLUB_KEYWORDS = new Set(['sport', 'racing', 'nacional', 'vitoria', 'athletico', 'independiente'])

function hasWordMatch(text: string, keyword: string): boolean {
  if (AMBIGUOUS_CLUB_KEYWORDS.has(keyword)) {
    // Use word boundary for ambiguous keywords
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (!new RegExp(`\\b${escaped}\\b`).test(text)) return false
    // Reject false positives
    if (keyword === 'sport' && (text.includes('sporting') || text.includes('sportivo') || text.includes('sports '))) return false
    if (keyword === 'independiente' && (text.includes('santa fe') || text.includes('del valle') || text.includes('rivadavia') || text.includes('petrolero'))) return false
    if (keyword === 'racing' && text.includes('racing louisville')) return false
    if (keyword === 'nacional' && (text.includes('atletico nacional') || text.includes('inter nacional'))) return false
    return true
  }
  return text.includes(keyword)
}

function getClubScore(teamName: string): number {
  const n = norm(teamName)
  if (!n) return 0
  for (const kw of TIER1_GLOBAL_ELITE) { if (hasWordMatch(n, kw)) return 70 }
  for (const kw of TIER2_GIANTS) { if (hasWordMatch(n, kw)) return 55 }
  for (const kw of TIER3_STRONG) { if (hasWordMatch(n, kw)) return 38 }
  return 5
}

// --- Competition tiers ----------------------------------------------------

const COMP_ELITE: string[] = [
  'champions league', 'copa libertadores', 'libertadores',
  'club world cup', 'world cup', 'euro ', 'copa america',
]

const COMP_HIGH: string[] = [
  'premier league', 'la liga', 'laliga', 'serie a', 'bundesliga', 'ligue 1',
  'copa sudamericana', 'sul-americana', 'sulamericana',
  'brasileirao', 'brasileiro', 'copa do brasil',
  'europa league', 'conference league',
  'fa cup', 'copa del rey', 'coppa italia', 'dfb pokal',
]

const COMP_MEDIUM: string[] = [
  'argentina primera', 'liga profesional', 'primera division',
  'liga mx', 'mls', 'major league soccer',
  'eredivisie', 'primeira liga', 'liga portugal',
  'saudi pro league', 'super lig', 'scottish premiership',
  'serie b', 'championship',
]

function getCompetitionScore(leagueName: string): number {
  const n = norm(leagueName)
  for (const kw of COMP_ELITE) { if (n.includes(kw)) return 50 }
  for (const kw of COMP_HIGH) { if (n.includes(kw)) return 38 }
  for (const kw of COMP_MEDIUM) { if (n.includes(kw)) return 24 }
  if (n.includes('friendly') || n.includes('amistoso')) return 2
  return 8
}

// --- Scoring function ----------------------------------------------------

export function scoreLiveMatchForFeature(fx: LiveFixture, options: RankingOptions = {}): FeaturedMatchScore {
  let score = 0
  const reasons: string[] = []

  // 1. CLUB SCORE (primary factor, up to ~140)
  const homeClub = getClubScore(fx.homeTeam.name)
  const awayClub = getClubScore(fx.awayTeam.name)
  const clubTotal = homeClub + awayClub
  score += clubTotal

  if (homeClub >= 70 || awayClub >= 70) reasons.push('Clube global de elite')
  else if (homeClub >= 55 || awayClub >= 55) reasons.push('Grande clube')
  else if (homeClub >= 38 || awayClub >= 38) reasons.push('Clube forte')

  if (homeClub >= 38 && awayClub >= 38) {
    score += 15
    reasons.push('Confronto entre grandes')
  }

  // 2. COMPETITION SCORE (up to 50)
  const compScore = getCompetitionScore(fx.league.name)
  score += compScore
  if (compScore >= 50) reasons.push('Competição de elite')
  else if (compScore >= 38) reasons.push('Competição forte')

  // 3. LIVE CONTEXT (up to 40)
  const elapsed = fx.status.elapsed || 0
  const isLive = ['LIVE', 'HT', '1H', '2H', 'ET', 'P'].includes(fx.status.short)
  if (isLive) {
    score += 25
    if (elapsed >= 75) { score += 15; reasons.push('Fase final') }
    else if (elapsed >= 60) { score += 8 }
    else if (elapsed >= 45) { score += 4 }
  }

  // 4. DRAMA SCORE (up to 35)
  const homeGoals = fx.score.home ?? 0
  const awayGoals = fx.score.away ?? 0
  const totalGoals = homeGoals + awayGoals
  const diff = Math.abs(homeGoals - awayGoals)

  if (elapsed >= 60 && diff <= 1 && totalGoals > 0) {
    score += 18
    reasons.push('Placar apertado em fase avançada')
  } else if (homeGoals === awayGoals && totalGoals > 0) {
    score += 12
  } else if (diff === 1) {
    score += 10
  }
  if (totalGoals >= 4) { score += 8; reasons.push('Jogo de muitos gols') }

  // 5. FAVORITES (up to 30)
  if (options.isFavoriteTeam) {
    if (options.isFavoriteTeam(fx.homeTeam.name) || options.isFavoriteTeam(fx.awayTeam.name)) {
      score += 30
      reasons.push('Favorito do usuário')
    }
  }

  // 6. COVERAGE (up to 15)
  const hasHomeLogo = Boolean(fx.homeTeam.logo)
  const hasAwayLogo = Boolean(fx.awayTeam.logo)
  if (hasHomeLogo && hasAwayLogo) score += 6
  else if (!hasHomeLogo && !hasAwayLogo) score -= 10
  if (options.stats) score += 5
  if (fx.league.logo) score += 2
  if (fx.provider === 'api_football') score += 2

  // 7. PENALTIES
  const leagueLower = norm(fx.league.name)
  if (leagueLower.includes('friendly') || leagueLower.includes('amistoso')) score -= 25
  if (leagueLower.includes('reserve') || leagueLower.includes('u20') || leagueLower.includes('u19') || leagueLower.includes('academy')) score -= 30

  // 8. SMALL GAME PENALTY (contextual)
  if (options.allFixtures && options.allFixtures.length > 1) {
    const hasBigGame = options.allFixtures.some(f => {
      if (f === fx) return false
      const hc = getClubScore(f.homeTeam.name)
      const ac = getClubScore(f.awayTeam.name)
      return hc >= 55 || ac >= 55
    })
    if (hasBigGame && clubTotal <= 20 && compScore <= 24) {
      score -= 25
    }
  }

  // Clamp (no upper limit — let big clubs dominate)
  score = Math.max(0, score)

  // Tier
  let tier: FeaturedMatchScore['tier'] = 'low'
  if (score >= 180) tier = 'elite'
  else if (score >= 120) tier = 'high'
  else if (score >= 70) tier = 'medium'

  return { score, reasons: reasons.slice(0, 5), tier }
}

/**
 * Sort fixtures by featured ranking score (descending).
 */
export function sortByFeaturedRanking(
  fixtures: LiveFixture[],
  options: { isFavoriteTeam?: (name: string) => boolean; statsMap?: Map<number, FixtureStats> } = {},
): LiveFixture[] {
  return [...fixtures].sort((a, b) => {
    const sa = scoreLiveMatchForFeature(a, { isFavoriteTeam: options.isFavoriteTeam, stats: options.statsMap?.get(a.id), allFixtures: fixtures })
    const sb = scoreLiveMatchForFeature(b, { isFavoriteTeam: options.isFavoriteTeam, stats: options.statsMap?.get(b.id), allFixtures: fixtures })
    if (sb.score !== sa.score) return sb.score - sa.score
    // Tie-breakers
    const clubA = getClubScore(a.homeTeam.name) + getClubScore(a.awayTeam.name)
    const clubB = getClubScore(b.homeTeam.name) + getClubScore(b.awayTeam.name)
    if (clubB !== clubA) return clubB - clubA
    return (b.status.elapsed || 0) - (a.status.elapsed || 0)
  })
}
