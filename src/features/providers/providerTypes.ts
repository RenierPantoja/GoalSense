/**
 * Provider type definitions for GoalSense multi-provider architecture.
 */

export type ProviderId = 'espn' | 'football_data' | 'api_football' | 'thesportsdb' | 'scorebat'

export interface ProviderCapabilities {
  liveScore: boolean
  fixtures: boolean
  standings: boolean
  stats: boolean
  events: boolean
  lineups: boolean
  logos: boolean
  videos: boolean
  rateLimited: boolean
  experimental: boolean
}

export interface ProviderConfig {
  id: ProviderId
  name: string
  capabilities: ProviderCapabilities
  enabled: boolean
  priority: number // lower = higher priority for data
}

export interface SourceIds {
  espn?: string
  footballData?: string
  apiFootball?: string
  theSportsDb?: string
}

export interface CanonicalFixture {
  canonicalMatchId: string
  primaryProvider: ProviderId
  sourceIds: SourceIds
  homeTeam: { name: string; logo: string | null }
  awayTeam: { name: string; logo: string | null }
  score: { home: number | null; away: number | null }
  status: { long: string; short: string; elapsed: number | null }
  league: { name: string; logo: string | null; country: string }
  date: string
  venue: string | null
  quality: 'full' | 'partial' | 'basic'
}
