/**
 * Cross-provider Match Resolver.
 * Finds ESPN match equivalent for a football-data.org fixture
 * using intelligent name/score/status matching — NEVER by ID.
 */

import { normalizeTeamName, teamNameSimilarity } from './teamNameNormalizer'
import { isSameMatchStrict } from './isSameMatchStrict'

export interface ResolverInput {
  homeName: string
  awayName: string
  scoreHome: number | null
  scoreAway: number | null
  isLive: boolean
  date: string
}

export interface EspnCandidate {
  id: string | number
  homeName: string
  awayName: string
  scoreHome: number
  scoreAway: number
  isLive: boolean
  date: string
  league?: string
}

export interface ResolverResult {
  resolvedProvider: 'espn' | 'original'
  confidence: number
  reason: string
  espnEventId?: string
  matchedCandidate?: EspnCandidate
}

export function resolveMatch(input: ResolverInput, candidates: EspnCandidate[]): ResolverResult {
  if (candidates.length === 0) {
    return { resolvedProvider: 'original', confidence: 0, reason: 'Nenhum candidato ESPN disponível' }
  }

  let bestScore = 0
  let bestCandidate: EspnCandidate | null = null
  let bestReason = ''

  for (const candidate of candidates) {
    let score = 0
    const reasons: string[] = []

    // Team name matching (most important — MANDATORY)
    const homeSim = teamNameSimilarity(input.homeName, candidate.homeName)
    const awaySim = teamNameSimilarity(input.awayName, candidate.awayName)

    if (homeSim >= 0.9 && awaySim >= 0.9) {
      score += 50
      reasons.push('times batem exatamente')
    } else if (homeSim >= 0.7 && awaySim >= 0.7) {
      score += 40
      reasons.push('times batem com alta similaridade')
    } else {
      // Check inverted (home/away swapped)
      const homeSimInv = teamNameSimilarity(input.homeName, candidate.awayName)
      const awaySimInv = teamNameSimilarity(input.awayName, candidate.homeName)
      if (homeSimInv >= 0.9 && awaySimInv >= 0.9) {
        score += 30
        reasons.push('times batem invertidos')
      } else if (homeSim < 0.4 || awaySim < 0.4) {
        // Teams clearly don't match — hard reject
        score -= 100
        reasons.push('times claramente diferentes')
      } else {
        // Partial match — not enough
        score -= 50
        reasons.push('match parcial insuficiente')
      }
    }

    // Score matching
    if (input.scoreHome !== null && input.scoreAway !== null) {
      if (input.scoreHome === candidate.scoreHome && input.scoreAway === candidate.scoreAway) {
        score += 15
        reasons.push('placar bate')
      } else if (Math.abs((input.scoreHome - candidate.scoreHome) + (input.scoreAway - candidate.scoreAway)) > 3) {
        score -= 20
        reasons.push('placar muito diferente')
      }
    }

    // Live status matching
    if (input.isLive === candidate.isLive) {
      score += 10
      reasons.push('status compatível')
    } else {
      score -= 10
    }

    // Date matching
    if (input.date && candidate.date) {
      const inputDate = input.date.slice(0, 10)
      const candDate = candidate.date.slice(0, 10)
      if (inputDate === candDate) {
        score += 10
        reasons.push('data bate')
      } else {
        score -= 15
      }
    }

    if (score > bestScore) {
      bestScore = score
      bestCandidate = candidate
      bestReason = reasons.join(', ')
    }
  }

  if (bestScore >= 80 && bestCandidate) {
    // Final safety: strict team match required
    const strict = isSameMatchStrict(
      { homeName: input.homeName, awayName: input.awayName },
      { homeName: bestCandidate.homeName, awayName: bestCandidate.awayName }
    )
    if (!strict) {
      if (import.meta.env.DEV) console.warn('[match-resolver-rejected]', {
        expected: `${input.homeName} vs ${input.awayName}`,
        got: `${bestCandidate.homeName} vs ${bestCandidate.awayName}`,
        score: bestScore,
        reason: 'isSameMatchStrict falhou',
      })
      return { resolvedProvider: 'original', confidence: bestScore, reason: 'Strict match failed' }
    }
    return {
      resolvedProvider: 'espn',
      confidence: Math.min(bestScore, 100),
      reason: bestReason,
      espnEventId: String(bestCandidate.id),
      matchedCandidate: bestCandidate,
    }
  }

  return {
    resolvedProvider: 'original',
    confidence: bestScore,
    reason: bestReason || 'Nenhum candidato ESPN com confiança suficiente',
  }
}

/**
 * Fetches ESPN scoreboard and resolves a fixture to an ESPN event ID.
 * Returns the ESPN event ID if found, null otherwise.
 */
export async function resolveToEspnEventId(fixture: ResolverInput): Promise<string | null> {
  try {
    const res = await fetch('https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard')
    if (!res.ok) return null
    const json = await res.json()
    const events = json.events || []

    const candidates: EspnCandidate[] = events.map((event: any) => {
      const comp = event.competitions?.[0]
      const home = comp?.competitors?.find((c: any) => c.homeAway === 'home')
      const away = comp?.competitors?.find((c: any) => c.homeAway === 'away')
      return {
        id: event.id,
        homeName: home?.team?.displayName || home?.team?.shortDisplayName || '',
        awayName: away?.team?.displayName || away?.team?.shortDisplayName || '',
        scoreHome: parseInt(home?.score) || 0,
        scoreAway: parseInt(away?.score) || 0,
        isLive: event.status?.type?.state === 'in',
        date: event.date || '',
        league: event.season?.slug || '',
      }
    })

    const result = resolveMatch(fixture, candidates)

    if (result.resolvedProvider === 'espn' && result.espnEventId) {
      if (import.meta.env.DEV) console.info('[match-resolver]', {
        fixture: `${fixture.homeName} vs ${fixture.awayName}`,
        resolvedProvider: result.resolvedProvider,
        confidence: result.confidence,
        reason: result.reason,
        espnEventId: result.espnEventId,
      })
      return result.espnEventId
    }

    return null
  } catch {
    return null
  }
}
