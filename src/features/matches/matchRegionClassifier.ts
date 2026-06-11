/**
 * matchRegionClassifier — robust region detection for /app/matches filters.
 * --------------------------------------------------------------------------
 * A match belongs to "Brasil" if it's a Brazilian competition OR if a
 * Brazilian club is playing (even in Libertadores, friendlies, etc.).
 * Same logic for "Europa" with European competitions/clubs.
 *
 * Detection uses TOKEN matching on normalized names (lowercase, no accents,
 * no punctuation). Single-word aliases must match a WHOLE token; multi-word
 * aliases must match a contiguous token sequence. This prevents substring
 * false positives like "Sporting"/"Sportivo" being read as "Sport" (Recife).
 *
 * Ambiguous single words (e.g. "sport", "vitoria") are treated as WEAK
 * evidence: they only classify a match as Brazil when the match also has
 * STRONG Brazilian evidence (a safe Brazilian club, a Brazilian competition,
 * or country = Brazil). See docs/MATCHES_REGION_FILTERS.md.
 *
 * No mocks. No invented data. No API calls.
 */

// --- Types ----------------------------------------------------------------

export type MatchRegion = 'brazil' | 'europe' | 'south_america' | 'north_america' | 'international' | 'other'

export interface RegionMatchResult {
  regions: MatchRegion[]
  reasons: string[]
}

type BrazilEvidence = 'strong' | 'weak' | null

// --- Normalization & token matching ---------------------------------------

function norm(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['\-\.~]/g, ' ').replace(/\s+/g, ' ').trim()
}

function tokenize(s: string): string[] {
  return norm(s).split(' ').filter(Boolean)
}

/** Does `tokens` contain `seq` as a contiguous sub-sequence of tokens? */
function hasTokenSequence(tokens: string[], seq: string[]): boolean {
  if (seq.length === 0 || seq.length > tokens.length) return false
  for (let i = 0; i + seq.length <= tokens.length; i++) {
    let ok = true
    for (let j = 0; j < seq.length; j++) {
      if (tokens[i + j] !== seq[j]) { ok = false; break }
    }
    if (ok) return true
  }
  return false
}

/**
 * Token-aware alias match. A single-word alias must equal a whole token; a
 * multi-word alias must appear as a contiguous token sequence. Never matches
 * inside a word (so "sport" does NOT match "sporting"/"sportivo").
 */
export function matchesClubAlias(name: string, alias: string): boolean {
  const nameTokens = tokenize(name)
  const aliasTokens = tokenize(alias)
  if (aliasTokens.length === 0) return false
  if (aliasTokens.length === 1) return nameTokens.includes(aliasTokens[0])
  return hasTokenSequence(nameTokens, aliasTokens)
}

function debugRegion(message: string, data: Record<string, unknown>): void {
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV) {
      // eslint-disable-next-line no-console
      console.debug(`[GoalSense][Region] ${message}`, data)
    }
  } catch { /* no-op */ }
}

// --- Brazilian clubs -------------------------------------------------------

// Safe single-word aliases: unique enough that a whole-token match alone is
// STRONG evidence of a Brazilian club.
const BRAZIL_SAFE_SINGLE = [
  'flamengo', 'palmeiras', 'corinthians', 'santos', 'vasco',
  'botafogo', 'fluminense', 'gremio', 'internacional', 'cruzeiro',
  'bahia', 'fortaleza', 'coritiba', 'chapecoense', 'mirassol',
  'novorizontino', 'paysandu', 'remo', 'avai', 'guarani',
  'juventude', 'criciuma', 'cuiaba', 'tombense', 'londrina', 'ituano',
  'bragantino', 'nautico', 'abc', 'csa', 'crb', 'ceara', 'goias', 'operario',
]

// Multi-word aliases: STRONG evidence (must match as a token sequence).
// Includes the safe Sport Recife aliases.
const BRAZIL_STRONG_MULTIWORD = [
  'sao paulo', 'atletico mineiro', 'atletico mg', 'athletico paranaense',
  'athletico pr', 'atletico goianiense', 'atletico go',
  'sport recife', 'sport club recife', 'sport club do recife',
  'sport clube do recife', 'sport c recife', 'sc recife',
  'america mineiro', 'america mg', 'vila nova', 'santa cruz',
  'ponte preta', 'sampaio correa', 'botafogo sp', 'botafogo pb',
  'red bull bragantino', 'rb bragantino',
  'vasco da gama', 'ceara sc',
]

// Ambiguous single words: WEAK evidence only. They classify Brazil ONLY when
// the match has strong Brazilian evidence elsewhere (safe club / comp / country).
// "sport" alone could be Sport Boys (PE) / Sportivo / Sporting; "vitoria" alone
// could be Vitória Guimarães / Setúbal (PT).
const BRAZIL_WEAK_SINGLE = ['sport', 'vitoria']

// Extra safety net: names that must NEVER count as Brazilian via the "sport"
// family, regardless of tokens. Used for clarity/auditing — token matching
// already prevents these, this is a defensive second layer.
const SPORT_LIKE_BLOCK_TOKENS = ['sporting', 'sportivo', 'sports']

function isSportLikeNonRecife(name: string): boolean {
  const tokens = tokenize(name)
  return SPORT_LIKE_BLOCK_TOKENS.some(t => tokens.includes(t))
}

/**
 * Classify a single team name as Brazilian evidence.
 * - 'strong': a safe single-word club or a strong multi-word alias.
 * - 'weak': only an ambiguous token (needs Brazilian context to count).
 * - null: no Brazilian signal.
 */
function classifyBrazilClub(teamName: string): BrazilEvidence {
  const n = norm(teamName)
  if (!n || n.length < 3) return null

  // Strong: multi-word aliases (sequence match).
  for (const alias of BRAZIL_STRONG_MULTIWORD) {
    if (matchesClubAlias(teamName, alias)) return 'strong'
  }
  // Strong: safe single-word aliases (whole-token match).
  for (const kw of BRAZIL_SAFE_SINGLE) {
    if (matchesClubAlias(teamName, kw)) return 'strong'
  }
  // Weak: ambiguous single words (need context).
  for (const kw of BRAZIL_WEAK_SINGLE) {
    if (kw === 'sport' && isSportLikeNonRecife(teamName)) {
      debugRegion('Ignored ambiguous sport-like name', { teamName, reason: 'sporting/sportivo/sports is not Sport Recife' })
      continue
    }
    if (matchesClubAlias(teamName, kw)) return 'weak'
  }
  return null
}

// --- Brazilian competitions -----------------------------------------------

const BRAZIL_COMP_KEYWORDS = [
  'brasil', 'brasileiro', 'brasileirao', 'serie a brazil', 'serie b brazil',
  'copa do brasil', 'paulista', 'carioca', 'mineiro', 'gaucho',
  'paranaense', 'baiano', 'cearense', 'pernambucano', 'goiano',
  'copa verde', 'copa nordeste', 'supercopa do brasil',
]

const BRAZIL_COUNTRIES = new Set(['brazil', 'brasil'])

// --- European clubs (keywords with word boundary) -------------------------

const EUROPEAN_CLUB_KEYWORDS = [
  'real madrid', 'barcelona', 'manchester united', 'manchester city',
  'liverpool', 'arsenal', 'chelsea', 'tottenham', 'bayern',
  'borussia dortmund', 'dortmund', 'psg', 'paris saint',
  'juventus', 'napoli', 'roma', 'lazio', 'atalanta', 'fiorentina',
  'atletico madrid', 'atletico de madrid',
  'benfica', 'porto', 'sporting cp', 'sporting lisbon',
  'ajax', 'psv', 'feyenoord',
  'celtic', 'rangers',
  'galatasaray', 'fenerbahce', 'besiktas',
  'sevilla', 'valencia', 'villarreal', 'athletic bilbao', 'real sociedad',
  'real betis', 'deportivo', 'espanyol', 'celta',
  'bayer leverkusen', 'leverkusen', 'rb leipzig', 'leipzig',
  'eintracht frankfurt', 'stuttgart', 'wolfsburg', 'monchengladbach',
  'marseille', 'lyon', 'monaco', 'lille', 'rennes',
  'newcastle', 'west ham', 'aston villa', 'brighton',
  'nottingham forest', 'wolverhampton', 'crystal palace',
  'everton', 'fulham', 'bournemouth', 'brentford',
  'leicester', 'leeds', 'southampton',
  'rayo vallecano', 'getafe', 'osasuna', 'mallorca', 'girona',
  'torino', 'bologna', 'udinese', 'sassuolo', 'empoli', 'lecce',
  'genoa', 'cagliari', 'verona', 'monza', 'como',
  'inter milan', 'internazionale', 'ac milan',
]

// Safe single-word European keywords (unique enough)
const EUROPE_SAFE_SINGLE = [
  'liverpool', 'arsenal', 'chelsea', 'tottenham', 'bayern',
  'juventus', 'napoli', 'lazio', 'atalanta', 'fiorentina',
  'benfica', 'ajax', 'psv', 'feyenoord', 'celtic', 'rangers',
  'galatasaray', 'fenerbahce', 'besiktas', 'sevilla', 'villarreal',
  'leverkusen', 'leipzig', 'stuttgart', 'wolfsburg',
  'marseille', 'lyon', 'monaco', 'lille', 'rennes',
  'newcastle', 'brighton', 'everton', 'fulham', 'bournemouth', 'brentford',
  'leicester', 'leeds', 'southampton', 'getafe', 'osasuna', 'mallorca',
  'girona', 'torino', 'bologna', 'udinese', 'empoli', 'lecce',
  'genoa', 'cagliari', 'monza', 'espanyol', 'dortmund', 'psg',
]

function isEuropeanClub(teamName: string): boolean {
  const n = norm(teamName)
  if (!n || n.length < 3) return false

  // Multi-word keywords (token sequence match — safe, never matches mid-word).
  for (const kw of EUROPEAN_CLUB_KEYWORDS) {
    if (kw.includes(' ') && matchesClubAlias(teamName, kw)) return true
  }

  // Single-word safe keywords (whole-token match). Generic words like "real",
  // "city", "united", "sporting" are intentionally NOT in this list.
  for (const kw of EUROPE_SAFE_SINGLE) {
    if (matchesClubAlias(teamName, kw)) return true
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

  // --- Brazil (strong/weak evidence model) ---
  const countryBrazil = BRAZIL_COUNTRIES.has(country)
  const compBrazil = BRAZIL_COMP_KEYWORDS.some(k => compName.includes(k))
  const homeBr = classifyBrazilClub(homeName)
  const awayBr = classifyBrazilClub(awayName)

  // Strong evidence = Brazilian country, Brazilian competition, or a safe
  // Brazilian club. Weak evidence (ambiguous tokens like "sport"/"vitoria")
  // only counts when strong evidence is present in the same match.
  const strongBrazil = countryBrazil || compBrazil || homeBr === 'strong' || awayBr === 'strong'

  if (strongBrazil) {
    regions.add('brazil')
    if (countryBrazil) reasons.push('País: Brasil')
    if (compBrazil) reasons.push(`Competição brasileira: ${match.competition.name}`)
    if (homeBr === 'strong') reasons.push(`Clube brasileiro: ${homeName}`)
    if (awayBr === 'strong') reasons.push(`Clube brasileiro: ${awayName}`)
    // Ambiguous clubs ride along only because there is strong context.
    if (homeBr === 'weak') reasons.push(`Clube brasileiro por contexto: ${homeName}`)
    if (awayBr === 'weak') reasons.push(`Clube brasileiro por contexto: ${awayName}`)
  } else if (homeBr === 'weak' || awayBr === 'weak') {
    // Weak-only signal — NOT enough to classify as Brazil.
    debugRegion('Weak Brazil evidence without context — not classified as brazil', {
      home: homeName, away: awayName, competition: match.competition.name,
    })
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
