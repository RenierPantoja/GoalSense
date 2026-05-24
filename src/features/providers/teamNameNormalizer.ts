/**
 * Normalizes team names for cross-provider matching.
 * Handles accents, prefixes/suffixes, common aliases.
 */

const TEAM_ALIASES: Record<string, string> = {
  // === BRASILEIRÃO SÉRIE A ===
  'gremio fbpa': 'gremio',
  'gremio foot-ball porto alegrense': 'gremio',
  'gremio porto alegre': 'gremio',
  'gremio rs': 'gremio',
  'santos fc': 'santos',
  'sao paulo fc': 'sao paulo',
  'spfc': 'sao paulo',
  'se palmeiras': 'palmeiras',
  'palmeiras sp': 'palmeiras',
  'cr flamengo': 'flamengo',
  'flamengo rj': 'flamengo',
  'fluminense fc': 'fluminense',
  'fluminense football club': 'fluminense',
  'sc corinthians': 'corinthians',
  'corinthians sp': 'corinthians',
  'corinthians paulista': 'corinthians',
  'sc internacional': 'internacional',
  'internacional rs': 'internacional',
  'inter rs': 'internacional',
  'atletico mineiro': 'atletico mineiro',
  'clube atletico mineiro': 'atletico mineiro',
  'atletico mg': 'atletico mineiro',
  'galo': 'atletico mineiro',
  'athletico paranaense': 'athletico paranaense',
  'athletico pr': 'athletico paranaense',
  'cap': 'athletico paranaense',
  'ec bahia': 'bahia',
  'bahia ba': 'bahia',
  'esporte clube bahia': 'bahia',
  'ec vitoria': 'vitoria',
  'vitoria ba': 'vitoria',
  'esporte clube vitoria': 'vitoria',
  'cruzeiro ec': 'cruzeiro',
  'cruzeiro mg': 'cruzeiro',
  'cruzeiro esporte clube': 'cruzeiro',
  'botafogo fr': 'botafogo',
  'botafogo rj': 'botafogo',
  'botafogo de futebol e regatas': 'botafogo',
  'vasco da gama': 'vasco',
  'cr vasco da gama': 'vasco',
  'club de regatas vasco da gama': 'vasco',
  'mirassol fc': 'mirassol',
  'mirassol futebol clube': 'mirassol',
  'ceara sc': 'ceara',
  'ceara sporting club': 'ceara',
  'fortaleza ec': 'fortaleza',
  'fortaleza esporte clube': 'fortaleza',
  'sport recife': 'sport',
  'sport club recife': 'sport',
  'sport club do recife': 'sport',
  'juventude rs': 'juventude',
  'ec juventude': 'juventude',
  'esporte clube juventude': 'juventude',
  'cuiaba ec': 'cuiaba',
  'cuiaba esporte clube': 'cuiaba',
  'red bull bragantino': 'bragantino',
  'rb bragantino': 'bragantino',
  'bragantino sp': 'bragantino',
  'atletico goianiense': 'atletico goianiense',
  'atletico go': 'atletico goianiense',
  'atletico goiania': 'atletico goianiense',
  'dragao': 'atletico goianiense',
  'goias ec': 'goias',
  'goias esporte clube': 'goias',
  'coritiba fc': 'coritiba',
  'coritiba foot ball club': 'coritiba',
  'america mg': 'america mineiro',
  'america mineiro': 'america mineiro',
  'america futebol clube': 'america mineiro',
  'chapecoense': 'chapecoense',
  'associacao chapecoense': 'chapecoense',
  // === EUROPEUS ===
  'atletico madrid': 'atletico madrid',
  'atletico de madrid': 'atletico madrid',
  'atl. madrid': 'atletico madrid',
  'atl madrid': 'atletico madrid',
  'fc barcelona': 'barcelona',
  'barca': 'barcelona',
  'real madrid cf': 'real madrid',
  'manchester united fc': 'manchester united',
  'manchester city fc': 'manchester city',
  'man city': 'manchester city',
  'man united': 'manchester united',
  'man utd': 'manchester united',
  'tottenham hotspur': 'tottenham',
  'spurs': 'tottenham',
  'wolverhampton wanderers': 'wolves',
  'wolverhampton': 'wolves',
  'newcastle united': 'newcastle',
  'newcastle utd': 'newcastle',
  'west ham united': 'west ham',
  'west ham utd': 'west ham',
  'fc internazionale': 'inter milan',
  'inter milan': 'inter milan',
  'internazionale': 'inter milan',
  'ac milan': 'milan',
  'juventus fc': 'juventus',
  'ssc napoli': 'napoli',
  'paris saint-germain': 'psg',
  'paris sg': 'psg',
  'olympique marseille': 'marseille',
  'olympique de marseille': 'marseille',
  'olympique lyonnais': 'lyon',
  'olympique lyon': 'lyon',
  'bayern munich': 'bayern',
  'fc bayern munchen': 'bayern',
  'bayern munchen': 'bayern',
  'borussia dortmund': 'dortmund',
  'bvb': 'dortmund',
  'rb leipzig': 'leipzig',
  'rasen ballsport leipzig': 'leipzig',
  'benfica': 'benfica',
  'sl benfica': 'benfica',
  'fc porto': 'porto',
  'sporting cp': 'sporting',
  'sporting lisbon': 'sporting',
  'ajax amsterdam': 'ajax',
  'afc ajax': 'ajax',
  'psv eindhoven': 'psv',
  'feyenoord rotterdam': 'feyenoord',
  'celtic fc': 'celtic',
  'rangers fc': 'rangers',
  'galatasaray sk': 'galatasaray',
  'fenerbahce sk': 'fenerbahce',
  'besiktas jk': 'besiktas',
  // === ARGENTINOS ===
  'boca juniors': 'boca juniors',
  'ca boca juniors': 'boca juniors',
  'river plate': 'river plate',
  'ca river plate': 'river plate',
  'racing club': 'racing',
  'racing club de avellaneda': 'racing',
  'independiente': 'independiente',
  'ca independiente': 'independiente',
  'san lorenzo': 'san lorenzo',
  'ca san lorenzo': 'san lorenzo',
}

// Suffixes/prefixes to strip
const STRIP_PATTERNS = [
  /\bfc\b/gi, /\bsc\b/gi, /\bec\b/gi, /\bac\b/gi, /\bcf\b/gi, /\brc\b/gi,
  /\bca\b/gi, /\bse\b/gi, /\bcr\b/gi, /\bce\b/gi, /\baa\b/gi, /\bad\b/gi,
  /\bus\b/gi, /\bas\b/gi, /\bss\b/gi, /\basd\b/gi, /\bssd\b/gi, /\bfr\b/gi,
  /\bfbpa\b/gi, /\bspa\b/gi,
  /\bfutebol\b/gi, /\bclube\b/gi, /\bclub\b/gi, /\besporte\b/gi,
  /\bfootball\b/gi, /\bsoccer\b/gi,
]

export function normalizeTeamName(name: string): string {
  if (!name) return ''

  let normalized = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/['.~\-]/g, ' ')        // Replace punctuation with space
    .replace(/\s+/g, ' ')
    .trim()

  // Check aliases first (before stripping)
  if (TEAM_ALIASES[normalized]) return TEAM_ALIASES[normalized]

  // Strip common suffixes/prefixes
  for (const pattern of STRIP_PATTERNS) {
    normalized = normalized.replace(pattern, '')
  }
  normalized = normalized.replace(/\s+/g, ' ').trim()

  // Check aliases again after stripping
  if (TEAM_ALIASES[normalized]) return TEAM_ALIASES[normalized]

  return normalized
}

/**
 * Calculate similarity between two team names (0 to 1).
 */
export function teamNameSimilarity(nameA: string, nameB: string): number {
  const a = normalizeTeamName(nameA)
  const b = normalizeTeamName(nameB)

  if (!a || !b) return 0
  if (a === b) return 1

  // One contains the other
  if (a.includes(b) || b.includes(a)) return 0.9

  // First significant word match
  const wordsA = a.split(' ').filter(w => w.length >= 3)
  const wordsB = b.split(' ').filter(w => w.length >= 3)
  const commonWords = wordsA.filter(w => wordsB.includes(w))
  if (commonWords.length > 0) {
    return 0.7 + (commonWords.length / Math.max(wordsA.length, wordsB.length)) * 0.3
  }

  // Levenshtein-like: character overlap
  const setA = new Set(a.replace(/\s/g, '').split(''))
  const setB = new Set(b.replace(/\s/g, '').split(''))
  let common = 0
  for (const ch of setA) { if (setB.has(ch)) common++ }
  const overlap = common / Math.max(setA.size, setB.size)
  return overlap * 0.6
}

/**
 * Check if two team names likely refer to the same team.
 */
export function teamsAreSame(nameA: string, nameB: string): boolean {
  return teamNameSimilarity(nameA, nameB) >= 0.7
}
