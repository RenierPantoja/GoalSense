/**
 * liveMatchRanking — intelligent scoring for choosing the featured match
 * on the Live Radar page.
 * -----------------------------------------------------------------------------
 * Criteria (weighted):
 *   A) Competition tier (elite / high / medium / low)
 *   B) Club popularity (curated set of globally/regionally popular clubs)
 *   C) User favorites (strong bonus)
 *   D) Match state (live > scheduled, tight score late = bonus)
 *   E) Visual/data coverage (logos, stats, provider quality)
 *   F) Penalties (no logos, obscure league, friendly)
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

// --- Competition tiers ---------------------------------------------------

const ELITE_COMPETITIONS = new Set([
  'champions league', 'uefa champions league',
  'premier league',
  'la liga', 'laliga',
  'serie a',
  'bundesliga',
  'ligue 1',
])

const HIGH_COMPETITIONS = new Set([
  'europa league', 'uefa europa league',
  'conference league',
  'copa libertadores', 'libertadores',
  'copa sudamericana', 'sul-americana',
  'brasileirão', 'brasileirao', 'campeonato brasileiro série a', 'serie a brazil',
  'copa do brasil',
  'fa cup', 'copa del rey', 'coppa italia', 'dfb pokal', 'coupe de france',
  'eredivisie',
  'primeira liga', 'liga portugal',
])

const MEDIUM_COMPETITIONS = new Set([
  'argentina primera', 'liga profesional', 'primera division argentina',
  'liga mx',
  'mls', 'major league soccer',
  'brasileirão série b', 'serie b brazil',
  'championship', 'efl championship',
  'segunda division', 'la liga 2',
  'serie b', 'serie b italy',
  '2. bundesliga',
  'ligue 2',
  'copa argentina',
  'superliga argentina',
])

function getCompetitionTier(leagueName: string): { tier: 'elite' | 'high' | 'medium' | 'low'; score: number } {
  const name = leagueName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  for (const c of ELITE_COMPETITIONS) if (name.includes(c)) return { tier: 'elite', score: 25 }
  for (const c of HIGH_COMPETITIONS) if (name.includes(c)) return { tier: 'high', score: 18 }
  for (const c of MEDIUM_COMPETITIONS) if (name.includes(c)) return { tier: 'medium', score: 10 }
  return { tier: 'low', score: 2 }
}

// --- Popular clubs -------------------------------------------------------

const POPULAR_CLUBS = new Set([
  // Europe
  'real madrid', 'barcelona', 'atletico madrid', 'atlético de madrid',
  'manchester city', 'manchester united', 'liverpool', 'arsenal', 'chelsea', 'tottenham',
  'bayern munich', 'bayern münchen', 'borussia dortmund',
  'psg', 'paris saint-germain', 'marseille',
  'juventus', 'inter', 'ac milan', 'napoli', 'roma',
  'benfica', 'porto', 'sporting',
  // Brazil
  'flamengo', 'palmeiras', 'corinthians', 'são paulo', 'sao paulo', 'santos',
  'vasco', 'vasco da gama', 'botafogo', 'fluminense',
  'grêmio', 'gremio', 'internacional',
  'atlético-mg', 'atletico-mg', 'atlético mineiro', 'cruzeiro',
  'bahia', 'athletico-pr', 'athletico paranaense', 'fortaleza',
  // Americas
  'boca juniors', 'river plate', 'racing', 'independiente', 'san lorenzo',
  'nacional', 'peñarol',
  'colo-colo', 'colo colo',
  'atletico nacional',
  'america', 'chivas', 'cruz azul', 'pumas', 'tigres', 'monterrey',
  'inter miami', 'la galaxy', 'lafc', 'seattle sounders',
])

function hasPopularClub(fx: LiveFixture): { has: boolean; score: number; reason?: string } {
  const h = fx.homeTeam.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const a = fx.awayTeam.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const homePopular = POPULAR_CLUBS.has(h)
  const awayPopular = POPULAR_CLUBS.has(a)
  if (homePopular && awayPopular) return { has: true, score: 16, reason: 'Clássico entre clubes populares' }
  if (homePopular || awayPopular) return { has: true, score: 10, reason: 'Clube popular' }
  return { has: false, score: 0 }
}

// --- Scoring function ----------------------------------------------------

export interface RankingOptions {
  isFavoriteTeam?: (name: string) => boolean
  stats?: FixtureStats
}

export function scoreLiveMatchForFeature(fx: LiveFixture, options: RankingOptions = {}): FeaturedMatchScore {
  let score = 0
  const reasons: string[] = []

  // A) Competition
  const comp = getCompetitionTier(fx.league.name)
  score += comp.score
  if (comp.tier === 'elite') reasons.push('Liga de elite')
  else if (comp.tier === 'high') reasons.push('Competição relevante')

  // B) Popular clubs
  const pop = hasPopularClub(fx)
  score += pop.score
  if (pop.reason) reasons.push(pop.reason)

  // C) Favorites
  if (options.isFavoriteTeam) {
    const favHome = options.isFavoriteTeam(fx.homeTeam.name)
    const favAway = options.isFavoriteTeam(fx.awayTeam.name)
    if (favHome || favAway) {
      score += 20
      reasons.push('Favorito do usuário')
    }
  }

  // D) Match state
  const elapsed = fx.status.elapsed || 0
  const isLive = ['LIVE', 'HT', '1H', '2H'].includes(fx.status.short)
  const homeGoals = fx.score.home ?? 0
  const awayGoals = fx.score.away ?? 0
  const totalGoals = homeGoals + awayGoals
  const diff = Math.abs(homeGoals - awayGoals)

  if (isLive) {
    score += 12
    reasons.push('Ao vivo')
  }
  if (elapsed >= 75) {
    score += 8
    if (diff <= 1 && totalGoals > 0) {
      score += 10
      reasons.push('Fase final com placar apertado')
    }
  } else if (elapsed >= 60) {
    score += 4
    if (homeGoals === awayGoals && totalGoals > 0) {
      score += 6
      reasons.push('Empate no segundo tempo')
    }
    if (diff === 1) {
      score += 5
    }
  }
  if (totalGoals >= 4) { score += 8; reasons.push('Jogo com muitos gols') }
  else if (totalGoals >= 2) { score += 4 }

  // E) Visual/data coverage
  const hasHomeLogo = Boolean(fx.homeTeam.logo)
  const hasAwayLogo = Boolean(fx.awayTeam.logo)
  if (hasHomeLogo && hasAwayLogo) { score += 8; reasons.push('Escudos disponíveis') }
  else if (hasHomeLogo || hasAwayLogo) { score += 3 }
  else { score -= 10 }

  if (fx.league.logo) score += 2

  if (options.stats) {
    score += 5
    const totalShots = (options.stats.shots?.home || 0) + (options.stats.shots?.away || 0)
    if (totalShots >= 12) { score += 4 }
  }

  if (fx.provider === 'api_football') score += 3
  else if (fx.provider === 'espn') score += 2

  // F) Penalties
  if (!hasHomeLogo && !hasAwayLogo) { score -= 5 }
  const leagueLower = fx.league.name.toLowerCase()
  if (leagueLower.includes('friendly') || leagueLower.includes('amistoso')) { score -= 12 }

  // Clamp
  score = Math.max(0, Math.min(100, score))

  // Determine tier from score
  let tier: FeaturedMatchScore['tier'] = 'low'
  if (score >= 70) tier = 'elite'
  else if (score >= 50) tier = 'high'
  else if (score >= 30) tier = 'medium'

  return { score, reasons: reasons.slice(0, 5), tier }
}

/**
 * Sort fixtures by featured ranking score (descending).
 * Returns a new array; does not mutate the input.
 */
export function sortByFeaturedRanking(
  fixtures: LiveFixture[],
  options: { isFavoriteTeam?: (name: string) => boolean; statsMap?: Map<number, FixtureStats> } = {},
): LiveFixture[] {
  return [...fixtures].sort((a, b) => {
    const sa = scoreLiveMatchForFeature(a, { isFavoriteTeam: options.isFavoriteTeam, stats: options.statsMap?.get(a.id) })
    const sb = scoreLiveMatchForFeature(b, { isFavoriteTeam: options.isFavoriteTeam, stats: options.statsMap?.get(b.id) })
    return sb.score - sa.score
  })
}
