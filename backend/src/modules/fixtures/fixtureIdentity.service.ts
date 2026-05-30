/**
 * Fixture Identity — canonical key generation and team name normalization.
 * Mirrors frontend logic for consistency.
 */

const TEAM_ALIASES: Record<string, string> = {
  'psg': 'Paris Saint-Germain',
  'paris saint germain': 'Paris Saint-Germain',
  'paris sg': 'Paris Saint-Germain',
  'man city': 'Manchester City',
  'man utd': 'Manchester United',
  'man united': 'Manchester United',
  'atletico madrid': 'Atlético Madrid',
  'atletico de madrid': 'Atlético Madrid',
  'inter milan': 'Inter',
  'internazionale': 'Inter',
  'fc barcelona': 'Barcelona',
  'real madrid cf': 'Real Madrid',
  'bayern munich': 'Bayern München',
  'bayern munchen': 'Bayern München',
}

export function normalizeTeamName(name: string): string {
  const lower = name.toLowerCase().trim()
  return TEAM_ALIASES[lower] || name.trim()
}

export function buildCanonicalKey(homeTeam: string, awayTeam: string, startTime: string): string {
  const home = normalizeTeamName(homeTeam).toLowerCase().replace(/[^a-z0-9]/g, '')
  const away = normalizeTeamName(awayTeam).toLowerCase().replace(/[^a-z0-9]/g, '')
  const date = startTime.slice(0, 10) // YYYY-MM-DD
  return `${home}:${away}:${date}`
}

const STATUS_PRECEDENCE: Record<string, number> = {
  'NS': 0, 'PST': 0, 'CANC': 0,
  '1H': 10, 'HT': 15, '2H': 20,
  'ET': 25, 'BT': 26, 'P': 27, 'AET': 28,
  'FT': 30, 'PEN': 30,
  'SUSP': 5, 'INT': 5,
}

export function getStatusPrecedence(status: string): number {
  return STATUS_PRECEDENCE[status] ?? 0
}

/**
 * Determines if a new status should replace the current one.
 * Status should never regress (e.g., 2H → 1H is invalid).
 */
export function shouldUpdateStatus(current: string, incoming: string): boolean {
  return getStatusPrecedence(incoming) >= getStatusPrecedence(current)
}
