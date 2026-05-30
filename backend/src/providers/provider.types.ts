/**
 * Provider types — normalized fixture data from any provider.
 */

export interface ProviderFixture {
  provider: string
  providerFixtureId: string
  homeTeam: string
  awayTeam: string
  competition: string
  status: string          // 1H, 2H, HT, FT, NS, P, ET, AET, etc.
  minute: number | null
  scoreHome: number
  scoreAway: number
  penaltyHome: number | null
  penaltyAway: number | null
  stats: ProviderStats | null
  events: ProviderEvent[] | null
  startTime: string       // ISO
}

export interface ProviderStats {
  possession?: { home: number; away: number }
  shots?: { home: number; away: number }
  shotsOnTarget?: { home: number; away: number }
  corners?: { home: number; away: number }
  yellowCards?: { home: number; away: number }
}

export interface ProviderEvent {
  type: string
  minute: number
  side: 'home' | 'away'
  playerName?: string
}

export interface ProviderFetchResult {
  provider: string
  endpoint: string
  success: boolean
  fixtures: ProviderFixture[]
  latencyMs: number
  error?: string
}
