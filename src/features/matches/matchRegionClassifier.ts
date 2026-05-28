/**
 * matchRegionClassifier — robust region detection for /app/matches filters.
 * --------------------------------------------------------------------------
 * A match belongs to "Brasil" if it's a Brazilian competition OR if a
 * Brazilian club is playing (even in Libertadores, friendlies, etc.).
 * Same logic for "Europa" with European competitions/clubs.
 *
 * Detection uses KEYWORD SUBSTRING matching on normalized names (lowercase,
 * no accents, no hyphens). This is intentionally more permissive than exact
 * set matching because providers send wildly different name formats.
 *
 * No mocks. No invented data. No API calls.
 */

// --- Types ----------------------------------------------------------------

export type MatchRegion = 'brazil' | 'europe' | 'south_america' | 'north_america' | 'international' | 'other'

export interface RegionMatchResult {
  regions: MatchRegion[]
  reasons: string[]
}

// --- Normalization --------------------------------------------------------

function norm(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['\-\.~]/g, ' ').replace(/\s+/g, ' ').trim()
}

// --- Brazilian clubs (keywords that appear in team names) ------------------
// We use KEYWORDS (substrings) not exact matches, because providers send
// names like "SC Corinthians Paulista", "CR Flamengo", "SE Palmeiras" etc.

const BRAZILIAN_CLUB_KEYWORDS = [
  'flamengo', 'palmeiras', 'corinthians', 'sao paulo', 'santos',
  'vasco', 'botafogo', 'fluminense', 'gremio', 'internacional',
  'cruzeiro', 'atletico mineiro', 'atletico mg', 'athletico paranaense',
  'athletico pr', 'bahia', 'fortaleza', 'ceara', 'sport',
  'vitoria', 'coritiba', 'goias', 'atletico goianiense', 'atletico go',
  'bragantino', 'juventude', 'criciuma', 'cuiaba',
  'america mineiro', 'america mg', 'paysandu', 'remo', 'avai',
  'chapecoense', 'ponte preta', 'guarani', 'mirassol', 'novorizontino',
  'operario', 'vila nova', 'crb', 'csa', 'nautico', 'santa cruz',
  'botafogo sp', 'botafogo pb', 'abc', 'sampaio correa',
  'tombense', 'londrina', 'ituano',
]

function isBrazilianClub(teamName: string): boolean {
  const n = norm(teamName)
  if (!n || n.length < 3) return false
  for (const keyword of BRAZILIAN_CLUB_KEYWORDS) {
    if (n.includes(keyword)) return true
  }
  return false
}

// --- Brazilian competitions -----------------------------------------------

const BRAZIL_COMP_KEYWORDS = [
  'brasil', 'brasileiro', 'brasileirao', 'serie a brazil', 'serie b brazil',
  'copa do brasil', 'paulista', 'carioca', 'mineiro', 'gaucho',
  'paranaense', 'baiano', 'cearense', 'pernambucano', 'goiano',
  'copa verde', 'copa nordeste', 'supercopa do brasil',
]

const BRAZIL_COUNTRIES = new Set(['brazil', 'brasil'])

// --- European clubs (keywords) --------------------------------------------

const EUROPEAN_CLUB_KEYWORDS = [
  'real madrid', 'barcelona', 'manchester united', 'manchester city',
  'liverpool', 'arsenal', 'chelsea', 'tottenham', 'bayern',
  'borussia dortmund', 'dortmund', 'psg', 'paris saint',
  'juventus', 'milan', 'inter', 'internazionale', 'napoli', 'roma',
  'lazio', 'atalanta', 'fiorentina',
  'atletico madrid', 'atletico de madrid',
  'benfica', 'porto', 'sporting',
  'ajax', 'psv', 'feyenoord',
  'celtic', 'rangers',
  'galatasaray', 'fenerbahce', 'besiktas',
  'sevilla', 'valencia', 'villarreal', 'athletic bilbao', 'real sociedad',
  'real betis', 'deportivo', 'espanyol', 'celta',
  'bayer leverkusen', 'leverkusen', 'rb leipzig', 'leipzig',
  'eintracht frankfurt', 'stuttgart', 'wolfsburg', 'monchengladbach',
  'marseille', 'lyon', 'monaco', 'lille', 'nice', 'lens', 'rennes',
  'newcastle', 'west ham', 'aston villa', 'brighton',
  'nottingham forest', 'wolves', 'wolverhampton', 'crystal palace',
  'everton', 'fulham', 'bournemouth', 'brentford',
  'leicester', 'leeds', 'southampton',
  'rayo vallecano', 'getafe', 'osasuna', 'mallorca', 'girona',
  'torino', 'bologna', 'udinese', 'sassuolo', 'empoli', 'lecce',
  'genoa', 'cagliari', 'verona', 'monza', 'como',
]

function isEuropeanClub(teamName: string): boolean {
  const n = norm(teamName)
  if (!n || n.length < 3) return false
  for (const keyword of EUROPEAN_CLUB_KEYWORDS) {
    if (n.includes(keyword)) return true
  }
  return false
}

// --- European competitions ------------------------------------------------

const EUROPE_COMP_KEYWORDS = [
  'champions league', 'europa league', 'conference league', 'uefa',
  'premier league', 'la liga', 'laliga', 'serie a', 'bundesliga', 'ligue 1',
  'eredivisie', 'primeira liga', 'liga portugal',
  'scottish premiership', 'super lig', 'belgian pro league',
  'austrian bundesliga', 'swiss super league', 'danish superliga',
  'norwegian eliteserien', 'swedish allsvenskan', 'polish ekstraklasa',
  'czech first league', 'croatian hnl', 'serbian superliga',
  'greek super league', 'ukrainian premier league',
  'championship', 'efl', 'segunda division', 'la liga 2',
  'serie b', '2. bundesliga', 'ligue 2',
  'fa cup', 'copa del rey', 'coppa italia', 'dfb pokal', 'coupe de france',
  'carabao cup', 'league cup', 'community shield', 'supercopa',
]

const EUROPE_COUNTRIES = new Set([
  'england', 'spain', 'germany', 'italy', 'france', 'netherlands',
  'portugal', 'scotland', 'turkey', 'belgium', 'austria', 'switzerland',
  'denmark', 'norway', 'sweden', 'poland', 'czech republic', 'croatia',
  'serbia', 'greece', 'ukraine', 'russia', 'romania', 'hungary',
  'ireland', 'wales', 'finland', 'iceland', 'cyprus', 'israel',
])

// --- South America --------------------------------------------------------

const SA_COMP_KEYWORDS = [
  'libertadores', 'sudamericana', 'sul-americana', 'recopa',
  'argentina primera', 'liga profesional', 'copa argentina',
  'uruguayan primera', 'chilean primera', 'colombian primera',
  'ecuadorian primera', 'paraguayan primera', 'peruvian primera',
  'liga betplay', 'ligapro', 'primera division argentina',
  'primera division uruguay', 'primera division chile',
]

const SA_COUNTRIES = new Set([
  'argentina', 'uruguay', 'chile', 'colombia', 'ecuador',
  'paraguay', 'peru', 'venezuela', 'bolivia',
])

// --- Public API -----------------------------------------------------------

export function classifyMatchRegions(match: {
  homeTeam: { name: string; shortName?: string }
  awayTeam: { name: string; shortName?: string }
  competition: { name: string }
  area?: { name: string }
}): RegionMatchResult {
  const regions = new Set<MatchRegion>()
  const reasons: string[] = []

  const homeName = match.homeTeam.shortName || match.homeTeam.name
  const awayName = match.awayTeam.shortName || match.awayTeam.name
  const compName = norm(match.competition.name)
  const country = norm(match.area?.name || '')

  // --- Brazil ---
  if (BRAZIL_COUNTRIES.has(country)) {
    regions.add('brazil')
    reasons.push('País: Brasil')
  }
  if (BRAZIL_COMP_KEYWORDS.some(k => compName.includes(k))) {
    regions.add('brazil')
    reasons.push(`Competição brasileira: ${match.competition.name}`)
  }
  if (isBrazilianClub(homeName)) {
    regions.add('brazil')
    reasons.push(`Clube brasileiro: ${homeName}`)
  }
  if (isBrazilianClub(awayName)) {
    regions.add('brazil')
    reasons.push(`Clube brasileiro: ${awayName}`)
  }

  // --- Europe ---
  if (EUROPE_COUNTRIES.has(country)) {
    regions.add('europe')
    reasons.push(`País europeu: ${match.area?.name}`)
  }
  if (EUROPE_COMP_KEYWORDS.some(k => compName.includes(k))) {
    regions.add('europe')
    reasons.push(`Competição europeia: ${match.competition.name}`)
  }
  if (isEuropeanClub(homeName)) {
    regions.add('europe')
    reasons.push(`Clube europeu: ${homeName}`)
  }
  if (isEuropeanClub(awayName)) {
    regions.add('europe')
    reasons.push(`Clube europeu: ${awayName}`)
  }

  // --- South America (non-Brazil) ---
  if (SA_COUNTRIES.has(country)) {
    regions.add('south_america')
  }
  if (SA_COMP_KEYWORDS.some(k => compName.includes(k))) {
    regions.add('south_america')
  }
  // Brazilian clubs in SA competitions also get south_america
  if (regions.has('brazil') && SA_COMP_KEYWORDS.some(k => compName.includes(k))) {
    regions.add('south_america')
  }

  // Default
  if (regions.size === 0) regions.add('other')

  return { regions: Array.from(regions), reasons }
}

/**
 * Quick check: does this match belong to the Brazil region?
 */
export function isMatchBrazil(match: { homeTeam: { name: string; shortName?: string }; awayTeam: { name: string; shortName?: string }; competition: { name: string }; area?: { name: string } }): boolean {
  return classifyMatchRegions(match).regions.includes('brazil')
}

/**
 * Quick check: does this match belong to the Europe region?
 */
export function isMatchEurope(match: { homeTeam: { name: string; shortName?: string }; awayTeam: { name: string; shortName?: string }; competition: { name: string }; area?: { name: string } }): boolean {
  return classifyMatchRegions(match).regions.includes('europe')
}
