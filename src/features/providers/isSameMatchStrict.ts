/**
 * Strict guard: verifies two fixtures represent the same real match.
 * Returns true ONLY if the team names clearly match.
 * Used to prevent opening the wrong match.
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

  // Both must be non-empty
  if (!expHome || !expAway || !candHome || !candAway) return false

  // Direct match
  const homeSim = teamNameSimilarity(expected.homeName, candidate.homeName)
  const awaySim = teamNameSimilarity(expected.awayName, candidate.awayName)

  if (homeSim >= 0.7 && awaySim >= 0.7) return true

  // Inverted match (rare but possible)
  const homeSimInv = teamNameSimilarity(expected.homeName, candidate.awayName)
  const awaySimInv = teamNameSimilarity(expected.awayName, candidate.homeName)

  if (homeSimInv >= 0.7 && awaySimInv >= 0.7) return true

  // Contains check: "Gremio" in "Gremio FBPA" etc
  if ((candHome.includes(expHome) || expHome.includes(candHome)) &&
      (candAway.includes(expAway) || expAway.includes(candAway))) return true

  return false
}
