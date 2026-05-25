/**
 * Team ID Resolver — resolves API-Football team IDs from team names.
 * Uses known IDs map (instant, no API call) + cache + API search fallback.
 */
import { normalizeTeamName, teamNameSimilarity } from '@/features/providers/teamNameNormalizer'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ResolveInput { teamName: string; competition?: string; country?: string }

export interface ResolveResult {
  found: boolean
  teamId?: number
  canonicalName?: string
  confidence: 'high' | 'medium' | 'low' | 'none'
  source: 'known_id' | 'cache' | 'api_search' | 'alias' | 'not_found'
  aliasUsed?: string
  normalizedInput: string
  reason?: string
  provider: 'api-football'
}

interface CacheEntry { teamId: number; canonicalName: string; confidence: 'high' | 'medium'; savedAt: number }

// ─── Known Team IDs (real API-Football IDs, organized by region) ─────────────

const KNOWN_IDS: Record<string, number> = {
  // ═══ MLS ═══
  'los angeles fc': 1599, 'lafc': 1599,
  'seattle sounders': 1595, 'seattle sounders fc': 1595,
  'inter miami': 9568, 'inter miami cf': 9568,
  'la galaxy': 1600, 'los angeles galaxy': 1600,
  'atlanta united': 1604, 'atlanta united fc': 1604,
  'new york city fc': 1602, 'nycfc': 1602,
  'new york red bulls': 1601,
  'portland timbers': 1617,
  'nashville sc': 9569,
  'columbus crew': 1607,
  'fc cincinnati': 9994,
  'philadelphia union': 1599,
  'austin fc': 10261,
  // ═══ Liga MX ═══
  'pumas unam': 2283, 'unam pumas': 2283, 'pumas': 2283, 'u.n.a.m. - pumas': 2283,
  'cruz azul': 2287,
  'club america': 2279, 'américa': 2279, 'america': 2279,
  'guadalajara': 2282, 'chivas': 2282, 'cd guadalajara': 2282,
  'monterrey': 2284, 'cf monterrey': 2284,
  'tigres': 2286, 'tigres uanl': 2286,
  'toluca': 2285,
  'santos laguna': 2288,
  'leon': 2281, 'león': 2281,
  'pachuca': 2289,
  // ═══ Brasil Série A ═══
  'flamengo': 127, 'palmeiras': 121, 'corinthians': 131,
  'são paulo': 126, 'sao paulo': 126, 'santos': 128,
  'grêmio': 130, 'gremio': 130, 'internacional': 119,
  'fluminense': 124, 'botafogo': 120,
  'vasco': 133, 'vasco da gama': 133,
  'cruzeiro': 129,
  'atlético mineiro': 1062, 'atletico mineiro': 1062, 'atletico-mg': 1062, 'atlético-mg': 1062,
  'athletico paranaense': 134, 'ath paranaense': 134,
  'bahia': 118, 'fortaleza': 132,
  'bragantino': 1193, 'rb bragantino': 1193, 'red bull bragantino': 1193,
  'cuiabá': 2317, 'cuiaba': 2317,
  'juventude': 1200, 'coritiba': 1196,
  'goiás': 1199, 'goias': 1199,
  'vitória': 2316, 'vitoria': 2316,
  'sport': 135, 'sport recife': 135,
  'ceará': 2315, 'ceara': 2315,
  // ═══ Brasil Série B/C ═══
  'volta redonda': 7770, 'volta redonda fc': 7770,
  'ypiranga-rs': 7847, 'ypiranga': 7847, 'ypiranga fc': 7847, 'ypiranga erechim': 7847,
  'mirassol': 7848, 'novorizontino': 7849,
  'ponte preta': 1197, 'guarani': 1198,
  'avaí': 7771, 'avai': 7771,
  'chapecoense': 1195,
  // ═══ England ═══
  'manchester city': 50, 'man city': 50,
  'liverpool': 40, 'arsenal': 42, 'chelsea': 49,
  'manchester united': 33, 'man united': 33, 'man utd': 33,
  'tottenham': 47, 'spurs': 47, 'tottenham hotspur': 47,
  'newcastle': 34, 'newcastle united': 34,
  'aston villa': 66, 'west ham': 48, 'west ham united': 48,
  'brighton': 51, 'brighton hove': 51,
  'crystal palace': 52, 'fulham': 36, 'brentford': 55,
  'everton': 45, 'wolverhampton': 39, 'wolves': 39,
  'nottingham forest': 65, 'bournemouth': 35,
  'leicester': 46, 'leicester city': 46,
  'ipswich': 57, 'ipswich town': 57,
  'southampton': 41,
  // ═══ Spain ═══
  'barcelona': 529, 'real madrid': 541,
  'atletico madrid': 530, 'atlético madrid': 530, 'atlético de madrid': 530,
  'real sociedad': 548, 'villarreal': 533, 'athletic bilbao': 531,
  'real betis': 543, 'sevilla': 536, 'valencia': 532,
  // ═══ Germany ═══
  'bayern munich': 157, 'bayern': 157, 'bayern münchen': 157,
  'borussia dortmund': 165, 'dortmund': 165,
  'bayer leverkusen': 168, 'leverkusen': 168,
  'rb leipzig': 173, 'leipzig': 173,
  'eintracht frankfurt': 169, 'frankfurt': 169,
  // ═══ Italy ═══
  'juventus': 496, 'inter': 505, 'inter milan': 505, 'internazionale': 505,
  'ac milan': 489, 'milan': 489, 'napoli': 492,
  'roma': 497, 'as roma': 497, 'lazio': 487,
  'atalanta': 499, 'fiorentina': 502, 'bologna': 500,
  'torino': 503, 'udinese': 494, 'genoa': 495,
  // ═══ France ═══
  'psg': 85, 'paris saint-germain': 85, 'paris saint germain': 85,
  'marseille': 81, 'olympique marseille': 81,
  'lyon': 80, 'olympique lyonnais': 80,
  'monaco': 91, 'lille': 79, 'lens': 116,
  // ═══ Portugal ═══
  'benfica': 211, 'porto': 212, 'fc porto': 212,
  'sporting': 228, 'sporting cp': 228, 'sporting lisbon': 228,
  'braga': 217, 'sc braga': 217,
  // ═══ Argentina ═══
  'boca juniors': 451, 'river plate': 435,
  'racing': 436, 'independiente': 437, 'san lorenzo': 438,
  'estudiantes': 434,
}

// ─── Aliases ─────────────────────────────────────────────────────────────────

const ALIASES: Record<string, string> = {
  'lafc': 'Los Angeles FC',
  'seattle sounders fc': 'Seattle Sounders',
  'pumas unam': 'Pumas UNAM',
  'u.n.a.m. - pumas': 'Pumas UNAM',
  'volta redonda fc': 'Volta Redonda',
  'ypiranga fc': 'Ypiranga-RS',
  'ypiranga erechim': 'Ypiranga-RS',
  'atletico-mg': 'Atletico Mineiro',
  'atlético-mg': 'Atletico Mineiro',
  'ath paranaense': 'Athletico Paranaense',
  'rb bragantino': 'Bragantino',
  'man utd': 'Manchester United',
  'man city': 'Manchester City',
  'spurs': 'Tottenham',
}

function resolveAlias(name: string): string {
  return ALIASES[name.toLowerCase().trim()] || name
}

// ─── Cache ───────────────────────────────────────────────────────────────────

const CACHE_KEY = 'goalsense_team_id_cache'
const CACHE_TTL = 7 * 24 * 3600_000

function loadCache(): Record<string, CacheEntry> { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') } catch { return {} } }
function saveCache(cache: Record<string, CacheEntry>): void { try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)) } catch {} }
function getCached(key: string): CacheEntry | null { const c = loadCache()[key]; if (!c || Date.now() - c.savedAt > CACHE_TTL) return null; return c }
function setCached(key: string, entry: Omit<CacheEntry, 'savedAt'>): void { const c = loadCache(); c[key] = { ...entry, savedAt: Date.now() }; saveCache(c) }

// ─── Main Resolver ───────────────────────────────────────────────────────────

export async function resolveApiFootballTeamId(input: ResolveInput): Promise<ResolveResult> {
  const { teamName, competition, country } = input
  const aliasResolved = resolveAlias(teamName)
  const normalized = normalizeTeamName(aliasResolved)
  const aliasUsed = aliasResolved !== teamName ? aliasResolved : undefined

  if (!normalized || normalized.length < 2) {
    return { found: false, confidence: 'none', source: 'not_found', normalizedInput: normalized || '', reason: 'Nome muito curto', provider: 'api-football' }
  }

  // 1. Known IDs (instant, no API call)
  const knownId = KNOWN_IDS[teamName.toLowerCase().trim()] || KNOWN_IDS[aliasResolved.toLowerCase().trim()] || KNOWN_IDS[normalized]
  if (knownId) {
    setCached(normalized, { teamId: knownId, canonicalName: aliasResolved, confidence: 'high' })
    return { found: true, teamId: knownId, canonicalName: aliasResolved, confidence: 'high', source: 'known_id', aliasUsed, normalizedInput: normalized, provider: 'api-football' }
  }

  // 2. Cache
  const cached = getCached(normalized)
  if (cached) {
    return { found: true, teamId: cached.teamId, canonicalName: cached.canonicalName, confidence: cached.confidence, source: 'cache', aliasUsed, normalizedInput: normalized, provider: 'api-football' }
  }

  // 3. API Search (fallback — may not work on free plan)
  try {
    const searchTerm = aliasResolved.length > 3 ? aliasResolved : normalized
    const resp = await fetch(`/api/api-football-fixtures?search_team=${encodeURIComponent(searchTerm)}`)
    const json = resp.ok ? await resp.json() : { response: [] }
    const teams: any[] = json.response || []

    if (teams.length === 0) {
      return { found: false, confidence: 'none', source: 'not_found', aliasUsed, normalizedInput: normalized, reason: `Nenhum resultado para "${searchTerm}" na API-Football`, provider: 'api-football' }
    }

    let bestMatch: { id: number; name: string; score: number } | null = null
    for (const item of teams) {
      const team = item.team || item
      const candidateName = team.name || ''
      let score = teamNameSimilarity(teamName, candidateName) * 100
      if (country && (item.team?.country || '').toLowerCase().includes(country.toLowerCase())) score += 10
      if (!bestMatch || score > bestMatch.score) bestMatch = { id: team.id, name: candidateName, score }
    }

    if (!bestMatch || bestMatch.score < 70) {
      return { found: false, confidence: 'low', source: 'not_found', aliasUsed, normalizedInput: normalized, reason: 'Nenhum match confiável na API', provider: 'api-football' }
    }

    const confidence = bestMatch.score >= 85 ? 'high' : 'medium'
    setCached(normalized, { teamId: bestMatch.id, canonicalName: bestMatch.name, confidence })
    return { found: true, teamId: bestMatch.id, canonicalName: bestMatch.name, confidence, source: 'api_search', aliasUsed, normalizedInput: normalized, provider: 'api-football' }
  } catch {
    return { found: false, confidence: 'none', source: 'not_found', aliasUsed, normalizedInput: normalized, reason: 'Erro na busca', provider: 'api-football' }
  }
}
