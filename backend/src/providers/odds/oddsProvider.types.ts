export type OddsProviderName = 'api_football' | 'odds_api' | 'sportmonks' | 'manual_future' | 'none' | 'unknown'

export type OddsMarketType =
  | 'match_winner'
  | 'over_under_goals'
  | 'both_teams_score'
  | 'next_goal'
  | 'corners'
  | 'cards'
  | 'asian_handicap'
  | 'custom_unknown'

export interface NormalizedOddsMarket {
  provider: string
  fixtureId?: string
  providerFixtureId?: string
  bookmaker?: string
  marketType: OddsMarketType
  selection: string
  line?: number
  odds: number
  currency?: string
  capturedAt: string
  raw?: unknown
}

export interface OddsProviderResponse {
  success: boolean
  markets: NormalizedOddsMarket[]
  stale?: boolean
  error?: string
}

/**
 * Provider Contract (D2 Prep)
 * Contract for actual implementations of external odds APIs.
 */
export interface OddsProviderAdapter {
  name: OddsProviderName
  isConfigured(): boolean
  fetchFixtureOdds(fixtureId: string, providerFixtureId?: string): Promise<NormalizedOddsMarket[]>
  fetchAlertOdds(alertId: string, candidateMarkets: OddsMarketType[]): Promise<NormalizedOddsMarket[]>
  normalize(raw: unknown): NormalizedOddsMarket[]
}
