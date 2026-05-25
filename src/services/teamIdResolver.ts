/**
 * Resolves API-Football team IDs from team names.
 * Uses search endpoint + local cache with 7-day TTL.
 */

import { normalizeTeamName, teamNameSimilarity } from '@/features/providers/teamNameNormalizer'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ResolveInput {
  teamName: string
  competition?: string
  country?: string
  season?: number
}

interface ResolveResult {
  found: boolean
  teamId?: number
  canonicalName?: string
  confidence: 'high' | 'medium' | 'low'
  reason?: string
  provider: 'api-football'
}

interface CacheEntry {
  teamId: number
  canonicalName: string
  confidence: 'high' | 'medium'
  savedAt: number
}

// ─── Cache ───────────────────────────────────────────────────────────────────

const CACHE_KEY = 'goalsense_team_id_cache'
const CACHE_TTL = 7 * 24 * 3600_000 // 7 days

function loadCache(): Record<string, CacheEntry> {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function saveCache(cache: Record<string, CacheEntry>): void {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)) } catch {}
}

function getCached(normalizedName: string): CacheEntry | null {
  const cache = loadCache()
  const entry = cache[normalizedName]
  if (!entry) return null
  if (Date.now() - entry.savedAt > CACHE_TTL) return null
  return entry
}

function setCached(normalizedName: string, entry: Omit<CacheEntry, 'savedAt'>): void {
  const cache = loadCache()
  cache[normalizedName] = { ...entry, savedAt: Date.now() }
  saveCache(cache)
}

// ─── Known Team IDs (avoids API calls for common teams) ──────────────────────

const KNOWN_TEAM_IDS: Record<string, number> = {
  // MLS
  'los angeles fc': 1599, 'lafc': 1599,
  'seattle sounders': 1595, 'seattle sounders fc': 1595,
  'inter miami': 9568, 'inter miami cf': 9568,
  'la galaxy': 1600, 'los angeles galaxy': 1600,
  // Mexico
  'pumas unam': 2283, 'unam pumas': 2283, 'pumas': 2283,
  'cruz azul': 2287,
  'club america': 2279, 'américa': 2279,
  'guadalajara': 2282, 'chivas': 2282,
  'monterrey': 2284,
  'tigres': 2286, 'tigres uanl': 2286,
  // Brazil Serie A
  'flamengo': 127, 'palmeiras': 121, 'corinthians': 131,
  'são paulo': 126, 'sao paulo': 126, 'santos': 128,
  'grêmio': 130, 'gremio': 130, 'internacional': 119,
  'fluminense': 124, 'botafogo': 120, 'vasco': 133, 'vasco da gama': 133,
  'cruzeiro': 129, 'atlético mineiro': 1062, 'atletico mineiro': 1062, 'atletico-mg': 1062,
  'athletico paranaense': 134, 'ath paranaense': 134,
  'bahia': 118, 'fortaleza': 132, 'bragantino': 1193, 'rb bragantino': 1193,
  'cuiabá': 2317, 'cuiaba': 2317, 'juventude': 1200,
  // Brazil Serie B/C
  'volta redonda': 7770, 'volta redonda fc': 7770,
  'ypiranga-rs': 7847, 'ypiranga': 7847, 'ypiranga fc': 7847, 'ypiranga erechim': 7847,
  // Europe
  'barcelona': 529, 'real madrid': 541, 'atletico madrid': 530,
  'manchester city': 50, 'man city': 50, 'liverpool': 40, 'arsenal': 42,
  'chelsea': 49, 'manchester united': 33, 'man united': 33, 'tottenham': 47,
  'bayern munich': 157, 'bayern': 157, 'borussia dortmund': 165, 'dortmund': 165,
  'psg': 85, 'paris saint-germain': 85, 'paris saint germain': 85,
  'juventus': 496, 'inter': 505, 'inter milan': 505, 'ac milan': 489, 'milan': 489,
  'napoli': 492, 'roma': 497, 'lazio': 487,
  'benfica': 211, 'porto': 212, 'sporting': 228,
}

function getKnownTeamId(name: string): number | null {
  const lower = name.toLowerCase().trim()
  return KNOWN_TEAM_IDS[lower] || null
}

// ─── Aliases for common name mismatches ───────────────────────────────────────

const TEAM_ALIASES: Record<string, string> = {
  'lafc': 'Los Angeles FC',
  'los angeles fc': 'Los Angeles FC',
  'seattle sounders fc': 'Seattle Sounders',
  'seattle sounders': 'Seattle Sounders',
  'pumas unam': 'Pumas UNAM',
  'pumas': 'Pumas UNAM',
  'u.n.a.m. - pumas': 'Pumas UNAM',
  'unam pumas': 'Pumas UNAM',
  'volta redonda': 'Volta Redonda',
  'volta redonda fc': 'Volta Redonda',
  'ypiranga': 'Ypiranga-RS',
  'ypiranga fc': 'Ypiranga-RS',
  'ypiranga erechim': 'Ypiranga-RS',
  'atletico-mg': 'Atletico Mineiro',
  'atlético-mg': 'Atletico Mineiro',
  'ath paranaense': 'Athletico Paranaense',
  'rb bragantino': 'Bragantino',
  'vasco da gama': 'Vasco DA Gama',
}

function resolveAlias(name: string): string {
  const lower = name.toLowerCase().trim()
  return TEAM_ALIASES[lower] || name
}

// ─── Main resolver ───────────────────────────────────────────────────────────

export async function resolveApiFootballTeamId(input: ResolveInput): Promise<ResolveResult> {
  const { teamName, competition, country } = input
  const aliasResolved = resolveAlias(teamName)
  const normalized = normalizeTeamName(aliasResolved)

  if (!normalized || normalized.length < 3) {
    return { found: false, confidence: 'low', reason: 'Nome muito curto', provider: 'api-football' }
  }

  // Check known team IDs first (no API call needed)
  const knownId = getKnownTeamId(teamName) || getKnownTeamId(aliasResolved)
  if (knownId) {
    setCached(normalized, { teamId: knownId, canonicalName: aliasResolved, confidence: 'high' })
    return { found: true, teamId: knownId, canonicalName: aliasResolved, confidence: 'high', provider: 'api-football' }
  }

  // Check cache
  const cached = getCached(normalized)
  if (cached) {
    if (import.meta.env.DEV) console.debug('[prematch-team-resolver] cache hit:', normalized, cached.teamId)
    return { found: true, teamId: cached.teamId, canonicalName: cached.canonicalName, confidence: cached.confidence, provider: 'api-football' }
  }

  // Search API-Football
  try {
    const searchTerm = aliasResolved.length > 3 ? aliasResolved : normalized
    
    // Strategy 1: Try /teams?search= endpoint
    let resp = await fetch(`/api/api-football-fixtures?search_team=${encodeURIComponent(searchTerm)}`)
    let json = resp.ok ? await resp.json() : { response: [] }
    let teams: any[] = json.response || []

    // Strategy 2: If /teams failed, try /teams?name= with shorter name
    if (teams.length === 0 && searchTerm.split(' ').length > 1) {
      const shortName = searchTerm.split(' ')[0]
      if (shortName.length >= 4) {
        resp = await fetch(`/api/api-football-fixtures?search_team=${encodeURIComponent(shortName)}`)
        json = resp.ok ? await resp.json() : { response: [] }
        teams = json.response || []
      }
    }

    if (teams.length === 0) {
      if (import.meta.env.DEV) console.debug('[prematch-team-resolver] no results for:', searchTerm)
      return { found: false, confidence: 'low', reason: `Nenhum time encontrado para "${searchTerm}"`, provider: 'api-football' }
    }

    // Score candidates
    let bestMatch: { id: number; name: string; score: number } | null = null

    for (const item of teams) {
      const team = item.team || item
      const candidateName = team.name || ''
      const candidateCountry = item.team?.country || item.country || ''

      let score = teamNameSimilarity(teamName, candidateName) * 100

      // Country bonus
      if (country && candidateCountry.toLowerCase().includes(country.toLowerCase())) {
        score += 10
      }

      // Competition name in league bonus
      if (competition && item.league?.name) {
        const compLower = competition.toLowerCase()
        const leagueLower = item.league.name.toLowerCase()
        if (compLower.includes(leagueLower) || leagueLower.includes(compLower)) {
          score += 5
        }
      }

      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { id: team.id, name: candidateName, score }
      }
    }

    if (!bestMatch || bestMatch.score < 70) {
      if (import.meta.env.DEV) console.debug('[prematch-team-resolver] low confidence:', normalized, bestMatch)
      return { found: false, confidence: 'low', reason: 'Nenhum match confiável', provider: 'api-football' }
    }

    const confidence = bestMatch.score >= 85 ? 'high' : 'medium'

    // Cache the result
    setCached(normalized, { teamId: bestMatch.id, canonicalName: bestMatch.name, confidence })

    if (import.meta.env.DEV) console.debug('[prematch-team-resolver] resolved:', normalized, '→', bestMatch.id, bestMatch.name, `(${confidence})`)

    return { found: true, teamId: bestMatch.id, canonicalName: bestMatch.name, confidence, provider: 'api-football' }
  } catch (err) {
    if (import.meta.env.DEV) console.debug('[prematch-team-resolver] error:', err)
    return { found: false, confidence: 'low', reason: 'Erro na busca', provider: 'api-football' }
  }
}
