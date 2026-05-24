/**
 * Creates a canonical match identifier from team names and date.
 * Used for deduplication across providers.
 */

import { normalizeTeamName } from './teamNameNormalizer'

export function buildCanonicalMatchId(homeName: string, awayName: string, date?: string): string {
  const home = normalizeTeamName(homeName).replace(/\s+/g, '')
  const away = normalizeTeamName(awayName).replace(/\s+/g, '')
  const dateStr = date ? date.slice(0, 10) : 'unknown'
  return `${dateStr}:${home}:${away}`
}
