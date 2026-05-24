/**
 * Central match importance/relevance scoring system v2.
 * Fair global editorial ranking: global appeal > local appeal.
 * Brazilian matches are relevant but cannot surpass global giants automatically.
 */

// ─── Competition Weights ─────────────────────────────────────────────────────

const COMPETITION_WEIGHTS: Record<string, number> = {
  'champions league': 60,
  'uefa champions league': 60,
  'europa league': 38,
  'uefa europa league': 38,
  'conference league': 28,
  'premier league': 50,
  'la liga': 45,
  'primera division': 45,
  'serie a': 42,
  'bundesliga': 40,
  'ligue 1': 34,
  'campeonato brasileiro série a': 36,
  'brasileirão série a': 36,
  'brazilian serie a': 36,
  'libertadores': 48,
  'copa libertadores': 48,
  'copa sudamericana': 30,
  'copa do brasil': 34,
  'copa america': 50,
  'euro': 55,
  'world cup': 65,
  'copa do mundo': 65,
  'championship': 22,
  'eredivisie': 24,
  'primeira liga': 26,
  'liga portugal': 26,
  'süper lig': 18,
  'mls': 22,
  'série b': 16,
}

function getCompetitionWeight(name: string): number {
  const lower = name.toLowerCase()
  for (const [key, weight] of Object.entries(COMPETITION_WEIGHTS)) {
    if (lower.includes(key)) return weight
  }
  if (lower.includes('cup') || lower.includes('copa')) return 24
  if (lower.includes('série') || lower.includes('serie') || lower.includes('division')) return 14
  if (lower.includes('league') || lower.includes('liga')) return 16
  return 10
}

// ─── Team Weights (by tier) ──────────────────────────────────────────────────

const GLOBAL_ELITE = 45
const GLOBAL_MAJOR = 38
const GLOBAL_RELEVANT = 26
const BRAZIL_ELITE = 30
const BRAZIL_MAJOR = 26
const BRAZIL_RELEVANT = 18
const KNOWN_MEDIUM = 10
const SMALL_DEFAULT = 5

const TEAM_TIERS: Record<string, number> = {
  // GLOBAL_ELITE (+45)
  'real madrid': GLOBAL_ELITE, 'barcelona': GLOBAL_ELITE,
  'manchester city': GLOBAL_ELITE, 'man city': GLOBAL_ELITE,
  'manchester united': GLOBAL_ELITE, 'man united': GLOBAL_ELITE, 'man utd': GLOBAL_ELITE,
  'liverpool': GLOBAL_ELITE, 'arsenal': GLOBAL_ELITE,
  'chelsea': GLOBAL_ELITE, 'bayern': GLOBAL_ELITE, 'bayern munich': GLOBAL_ELITE, 'bayern münchen': GLOBAL_ELITE,
  'psg': GLOBAL_ELITE, 'paris saint-germain': GLOBAL_ELITE, 'paris saint germain': GLOBAL_ELITE,

  // GLOBAL_MAJOR (+38)
  'milan': GLOBAL_MAJOR, 'ac milan': GLOBAL_MAJOR,
  'inter': GLOBAL_MAJOR, 'inter milan': GLOBAL_MAJOR, 'internazionale': GLOBAL_MAJOR,
  'juventus': GLOBAL_MAJOR,
  'atlético madrid': GLOBAL_MAJOR, 'atletico madrid': GLOBAL_MAJOR, 'atlético de madrid': GLOBAL_MAJOR,
  'tottenham': GLOBAL_MAJOR, 'spurs': GLOBAL_MAJOR,
  'borussia dortmund': GLOBAL_MAJOR, 'dortmund': GLOBAL_MAJOR,
  'napoli': GLOBAL_MAJOR,

  // GLOBAL_RELEVANT (+26)
  'aston villa': GLOBAL_RELEVANT, 'newcastle': GLOBAL_RELEVANT, 'newcastle united': GLOBAL_RELEVANT,
  'west ham': GLOBAL_RELEVANT, 'west ham united': GLOBAL_RELEVANT,
  'roma': GLOBAL_RELEVANT, 'lazio': GLOBAL_RELEVANT,
  'bayer leverkusen': GLOBAL_RELEVANT, 'leverkusen': GLOBAL_RELEVANT, 'rb leipzig': GLOBAL_RELEVANT,
  'benfica': GLOBAL_RELEVANT, 'porto': GLOBAL_RELEVANT, 'sporting': GLOBAL_RELEVANT,
  'ajax': GLOBAL_RELEVANT, 'sevilla': GLOBAL_RELEVANT,
  'real sociedad': 22, 'villarreal': 22, 'valencia': 22,
  'athletic bilbao': 20, 'real betis': 20,
  'marseille': 22, 'lyon': 20, 'monaco': 18, 'lille': 18,
  'feyenoord': 18, 'psv': 18,
  'atalanta': 22, 'fiorentina': 20,

  // Premier League mid-tier
  'everton': 18, 'leeds': 18, 'leeds united': 18,
  'leicester': 16, 'brighton': 16, 'brighton hove': 16,
  'wolverhampton': 15, 'wolves': 15, 'crystal palace': 15,
  'nottingham forest': 14, 'fulham': 14, 'bournemouth': 13, 'brentford': 13,
  'sunderland': 14, 'burnley': 12, 'sheffield': 12, 'ipswich': 10, 'southampton': 12, 'luton': 10,

  // BRAZIL_ELITE (+30)
  'flamengo': BRAZIL_ELITE, 'palmeiras': BRAZIL_ELITE,
  'corinthians': BRAZIL_ELITE, 'são paulo': BRAZIL_ELITE, 'sao paulo': BRAZIL_ELITE,

  // BRAZIL_MAJOR (+26)
  'santos': BRAZIL_MAJOR, 'grêmio': BRAZIL_MAJOR, 'gremio': BRAZIL_MAJOR,
  'internacional': BRAZIL_MAJOR, 'vasco': BRAZIL_MAJOR, 'vasco da gama': BRAZIL_MAJOR,
  'fluminense': BRAZIL_MAJOR, 'botafogo': BRAZIL_MAJOR,
  'cruzeiro': BRAZIL_MAJOR, 'atlético mineiro': BRAZIL_MAJOR, 'atletico mineiro': BRAZIL_MAJOR,
  'atlético-mg': BRAZIL_MAJOR, 'atletico-mg': BRAZIL_MAJOR,

  // BRAZIL_RELEVANT (+18)
  'athletico': BRAZIL_RELEVANT, 'athletico paranaense': BRAZIL_RELEVANT, 'ath paranaense': BRAZIL_RELEVANT,
  'bahia': BRAZIL_RELEVANT, 'fortaleza': BRAZIL_RELEVANT,
  'bragantino': BRAZIL_RELEVANT, 'rb bragantino': BRAZIL_RELEVANT,
  'sport': 14, 'vitória': 14, 'ceará': 14, 'goiás': 12,
  'cuiabá': 12, 'juventude': 10, 'coritiba': 10,

  // South America
  'boca juniors': BRAZIL_MAJOR, 'river plate': BRAZIL_MAJOR,
  'racing': 16, 'independiente': 16, 'san lorenzo': 14, 'estudiantes': 14,

  // Serie A Italy smaller
  'torino': 14, 'genoa': 12, 'udinese': 12, 'bologna': 14, 'monza': 8,
  'parma': 10, 'sassuolo': 8, 'empoli': 8, 'lecce': 8,
  'cagliari': 10, 'verona': 8, 'frosinone': 6, 'salernitana': 6, 'como': 8, 'venezia': 8,
}

function getTeamWeight(name: string): number {
  const lower = name.toLowerCase().trim()
  if (TEAM_TIERS[lower] !== undefined) return TEAM_TIERS[lower]
  for (const [key, weight] of Object.entries(TEAM_TIERS)) {
    if (lower.includes(key) || key.includes(lower)) return weight
  }
  return SMALL_DEFAULT
}

function getTeamTier(name: string): 'global_elite' | 'global_major' | 'global_relevant' | 'brazil_elite' | 'brazil_major' | 'brazil_relevant' | 'medium' | 'small' {
  const w = getTeamWeight(name)
  if (w >= GLOBAL_ELITE) return 'global_elite'
  if (w >= GLOBAL_MAJOR) return 'global_major'
  if (w >= GLOBAL_RELEVANT) return 'global_relevant'
  if (w >= BRAZIL_ELITE) return 'brazil_elite'
  if (w >= BRAZIL_MAJOR) return 'brazil_major'
  if (w >= BRAZIL_RELEVANT) return 'brazil_relevant'
  if (w >= KNOWN_MEDIUM) return 'medium'
  return 'small'
}

// ─── Rivalry Detection ───────────────────────────────────────────────────────

const REAL_CLASSICS: [string, string][] = [
  // Brazilian classics (TRUE derbies)
  ['flamengo', 'fluminense'], ['flamengo', 'vasco'], ['flamengo', 'botafogo'],
  ['corinthians', 'palmeiras'], ['corinthians', 'são paulo'], ['corinthians', 'santos'],
  ['palmeiras', 'são paulo'], ['palmeiras', 'santos'],
  ['grêmio', 'internacional'], ['atlético mineiro', 'cruzeiro'],
  ['bahia', 'vitória'],
  // European classics
  ['real madrid', 'barcelona'], ['real madrid', 'atlético madrid'],
  ['manchester city', 'manchester united'], ['man city', 'man united'],
  ['liverpool', 'manchester united'], ['liverpool', 'man united'], ['liverpool', 'everton'],
  ['arsenal', 'tottenham'], ['arsenal', 'chelsea'], ['chelsea', 'tottenham'],
  ['milan', 'inter'], ['ac milan', 'inter'], ['juventus', 'inter'], ['juventus', 'milan'],
  ['roma', 'lazio'],
  ['boca juniors', 'river plate'],
  ['benfica', 'porto'], ['benfica', 'sporting'],
  ['ajax', 'feyenoord'],
  ['bayern', 'dortmund'], ['bayern munich', 'borussia dortmund'],
  ['psg', 'marseille'], ['barcelona', 'atlético madrid'],
]

function isRealClassic(homeName: string, awayName: string): boolean {
  const h = homeName.toLowerCase().trim()
  const a = awayName.toLowerCase().trim()
  return REAL_CLASSICS.some(([t1, t2]) =>
    (h.includes(t1) && a.includes(t2)) || (h.includes(t2) && a.includes(t1))
  )
}

// ─── Main Scoring Function ───────────────────────────────────────────────────

interface MatchForScoring {
  competition: { name: string }
  homeTeam: { name: string; shortName?: string }
  awayTeam: { name: string; shortName?: string }
  score: { fullTime: { home: number | null; away: number | null } }
  status: string
  utcDate: string
  area?: { name: string }
}

export interface ImportanceResult {
  score: number
  reason: string
  badge: { label: string; style: string }
  competitionWeight: number
  homeWeight: number
  awayWeight: number
  globalPullBonus: number
  isBrazilian: boolean
}

export function calculateMatchImportance(m: MatchForScoring): ImportanceResult {
  const compName = m.competition.name
  const homeName = m.homeTeam.shortName || m.homeTeam.name
  const awayName = m.awayTeam.shortName || m.awayTeam.name

  const competitionWeight = getCompetitionWeight(compName)
  const homeWeight = getTeamWeight(homeName)
  const awayWeight = getTeamWeight(awayName)
  const homeTier = getTeamTier(homeName)
  const awayTier = getTeamTier(awayName)

  const isBrazilian = compName.toLowerCase().includes('brasil') || compName.toLowerCase().includes('série a') ||
    m.area?.name === 'Brazil'

  let score = competitionWeight + homeWeight + awayWeight

  // ─── Global Pull Bonus ───────────────────────────────────────────────────
  let globalPullBonus = 0
  if (homeTier === 'global_elite' || awayTier === 'global_elite') globalPullBonus = 25
  else if (homeTier === 'global_major' || awayTier === 'global_major') globalPullBonus = 15
  else if (homeTier === 'global_relevant' || awayTier === 'global_relevant') globalPullBonus = 8
  score += globalPullBonus

  // ─── Brazil Bonus (moderate) ─────────────────────────────────────────────
  let brazilBonus = 0
  if (isBrazilian) {
    brazilBonus = 6
    score += brazilBonus
  }

  // ─── Status Bonuses ──────────────────────────────────────────────────────
  const isLive = m.status === 'IN_PLAY' || m.status === 'LIVE' || m.status === 'PAUSED'
  const isFinished = m.status === 'FINISHED'
  const isUpcoming = m.status === 'TIMED' || m.status === 'SCHEDULED'

  if (isLive) score += 18
  if (isUpcoming) {
    const diffMin = Math.round((new Date(m.utcDate).getTime() - Date.now()) / 60000)
    if (diffMin > 0 && diffMin <= 60) score += 8
  }

  // ─── Classic Bonus ───────────────────────────────────────────────────────
  let classicBonus = 0
  if (isRealClassic(homeName, awayName)) {
    classicBonus = 18
    score += classicBonus
  } else if (isBrazilian && homeWeight >= BRAZIL_ELITE && awayWeight >= BRAZIL_MAJOR) {
    // National big match (not a real classic, but big teams)
    classicBonus = 8
    score += classicBonus
  }

  // ─── Goal Bonuses ────────────────────────────────────────────────────────
  const h = m.score.fullTime.home
  const a = m.score.fullTime.away
  if (h !== null && a !== null) {
    const totalGoals = h + a
    const diff = Math.abs(h - a)
    if (totalGoals >= 5) score += 10
    else if (totalGoals >= 4) score += 8
    if (isFinished && diff >= 3) score += 6
    if (isLive && totalGoals >= 3) score += 6
  }

  // ─── Big Match Equilibrium Bonus ─────────────────────────────────────────
  if (homeWeight >= GLOBAL_RELEVANT && awayWeight >= GLOBAL_RELEVANT) score += 8

  // ─── Penalties ───────────────────────────────────────────────────────────
  if (homeWeight <= 8 && awayWeight <= 8) score -= 8
  if (competitionWeight <= 14) score -= 6

  // ─── Reason ──────────────────────────────────────────────────────────────
  const reason = buildReason(compName, homeName, awayName, homeTier, awayTier, competitionWeight, isLive, isFinished, h, a, isRealClassic(homeName, awayName), isBrazilian, globalPullBonus)

  // ─── Badge ───────────────────────────────────────────────────────────────
  const badge = score >= 110 ? { label: 'Principal', style: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' }
    : score >= 90 ? { label: 'Alta', style: 'bg-amber-500/10 text-amber-400 border-amber-500/20' }
    : score >= 70 ? { label: 'Média', style: 'bg-white/[0.04] text-white/40 border-white/[0.08]' }
    : { label: '', style: '' }

  if (import.meta.env.DEV) {
    console.debug('[match-importance]', {
      match: `${homeName} x ${awayName}`,
      competition: compName,
      score, competitionWeight, homeWeight, awayWeight,
      globalPullBonus, brazilBonus, classicBonus, reason,
    })
  }

  return { score, reason, badge, competitionWeight, homeWeight, awayWeight, globalPullBonus, isBrazilian }
}

function buildReason(
  compName: string, _homeName: string, _awayName: string,
  homeTier: string, awayTier: string, compWeight: number,
  isLive: boolean, isFinished: boolean,
  homeScore: number | null, awayScore: number | null,
  classic: boolean, isBrazilian: boolean, globalPull: number
): string {
  if (classic) return 'Clássico'
  if (isLive && homeScore !== null && awayScore !== null && (homeScore + awayScore) >= 4) return 'Jogo aberto ao vivo'
  if (isLive && globalPull >= 25) return 'Gigante ao vivo'
  if (isLive) return 'Ao vivo agora'
  if (isFinished && homeScore !== null && awayScore !== null && Math.abs(homeScore - awayScore) >= 3) return 'Placar dominante'

  if (homeTier === 'global_elite' || awayTier === 'global_elite') {
    if (compWeight >= 50) return 'Premier League com gigante europeu'
    return 'Clube global em campo'
  }
  if (homeTier === 'global_major' || awayTier === 'global_major') return 'Jogo de alto apelo global'

  if (isBrazilian) {
    if (homeTier === 'brazil_elite' || awayTier === 'brazil_elite') return 'Brasileirão com clube grande'
    return 'Brasileirão'
  }

  const comp = compName.toLowerCase()
  if (comp.includes('premier')) return 'Premier League'
  if (comp.includes('champions')) return 'Champions League'
  if (comp.includes('libertadores')) return 'Libertadores'
  if (comp.includes('la liga') || comp.includes('primera')) return 'La Liga'
  if (comp.includes('bundesliga')) return 'Bundesliga'
  if (comp.includes('serie a')) return 'Serie A'

  if (compWeight >= 38) return 'Liga de elite'
  if (homeTier === 'global_relevant' || awayTier === 'global_relevant') return 'Clube relevante em campo'

  return 'Jogo do dia'
}

// ─── Sorting ─────────────────────────────────────────────────────────────────

export function sortMatchesByImportance<T extends MatchForScoring>(matches: T[]): T[] {
  return [...matches].sort((a, b) => calculateMatchImportance(b).score - calculateMatchImportance(a).score)
}

// ─── Featured match helpers ──────────────────────────────────────────────────

/** Returns the single most important match globally */
export function getMainGlobalMatch<T extends MatchForScoring>(matches: T[]): T | null {
  if (matches.length === 0) return null
  return sortMatchesByImportance(matches)[0]
}

/** Returns the best Brazilian match, or null if no Brazilian matches */
export function getBrazilFeaturedMatch<T extends MatchForScoring>(matches: T[]): T | null {
  const brazilian = matches.filter(m =>
    m.competition.name.toLowerCase().includes('brasil') ||
    m.competition.name.toLowerCase().includes('série') ||
    m.area?.name === 'Brazil'
  )
  if (brazilian.length === 0) return null
  return sortMatchesByImportance(brazilian)[0]
}

// ─── Convenience exports ─────────────────────────────────────────────────────

export function getMatchImportanceScore(m: MatchForScoring): number {
  return calculateMatchImportance(m).score
}

export function getMatchImportanceReason(m: MatchForScoring): string {
  return calculateMatchImportance(m).reason
}

export function getMatchImportanceBadge(m: MatchForScoring): { label: string; style: string } {
  return calculateMatchImportance(m).badge
}
