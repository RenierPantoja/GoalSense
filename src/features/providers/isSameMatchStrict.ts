/**
 * Strict guard: verifies two fixtures represent the same real match.
 * Returns true ONLY if the team names clearly match.
 * Used to prevent opening the wrong match.
 * 
 * IMPORTANT: This must be strict enough to never return true for different matches.
 * False negatives (missing a valid match) are acceptable.
 * False positives (accepting wrong match) are NOT acceptable.
 */

import { normalizeTeamName, teamNameSimilarity } from './teamNameNormalizer'

interface MatchIdentity {
  homeName: string
  awayName: string
}

export function isSameMatchStrict(expected: MatchIdentity, candidate: MatchIdentity): boolean {
  const expHome = normalizeTeamName(expected.homeName)
  const expAway = normalizeTeamName(expected.awayName)
  const candHome = normalizeTeamName(candidate.homeName)
  const candAway = normalizeTeamName(candidate.awayName)

  // Both must be non-empty and meaningful (at least 3 chars)
  if (!expHome || !expAway || !candHome || !candAway) return false
  if (expHome.length < 3 || expAway.length < 3 || candHome.length < 3 || candAway.length < 3) return false

  // Exact normalized match (best case)
  if (expHome === candHome && expAway === candAway) return true

  // Direct similarity — require HIGH threshold (0.8, not 0.7)
  const homeSim = teamNameSimilarity(expected.homeName, candidate.homeName)
  const awaySim = teamNameSimilarity(expected.awayName, candidate.awayName)
  if (homeSim >= 0.8 && awaySim >= 0.8) return true

  // Inverted match (very rare but possible in some APIs)
  if (teamNameSimilarity(expected.homeName, candidate.awayName) >= 0.8 &&
      teamNameSimilarity(expected.awayName, candidate.homeName) >= 0.8) return true

  // Contains check — ONLY if one is clearly a substring of the other AND both are long enough
  // "Parma" should NOT match "Athletico Paranaense" — require both sides to match
  if (expHome.length >= 4 && expAway.length >= 4 && candHome.length >= 4 && candAway.length >= 4) {
    const homeContains = (candHome === expHome) || (candHome.startsWith(expHome + ' ') || expHome.startsWith(candHome + ' '))
    const awayContains = (candAway === expAway) || (candAway.startsWith(expAway + ' ') || expAway.startsWith(candAway + ' '))
    if (homeContains && awayContains) return true
  }

  return false
}
