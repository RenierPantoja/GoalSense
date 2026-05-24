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

  // Check cache first
  const cached = getCached(normalized)
  if (cached) {
    if (import.meta.env.DEV) console.debug('[prematch-team-resolver] cache hit:', normalized, cached.teamId)
    return { found: true, teamId: cached.teamId, canonicalName: cached.canonicalName, confidence: cached.confidence, provider: 'api-football' }
  }

  // Search API-Football
  try {
    const searchTerm = aliasResolved.length > 3 ? aliasResolved : normalized
    const resp = await fetch(`/api/api-football-fixtures?search_team=${encodeURIComponent(searchTerm)}`)
    if (!resp.ok) {
      return { found: false, confidence: 'low', reason: 'API indisponível', provider: 'api-football' }
    }

    const json = await resp.json()
    const teams: any[] = json.response || []

    if (teams.length === 0) {
      return { found: false, confidence: 'low', reason: 'Nenhum time encontrado', provider: 'api-football' }
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
