export type LiveFirstMode = 'disabled' | 'observe' | 'active_local'

export type BestAvailableDataMode =
  | 'pre_match_full'
  | 'pre_match_limited'
  | 'live_espn_only'
  | 'live_mixed'
  | 'manual_plus_live'
  | 'post_match_only'

export type LiveDataAvailability = 'available' | 'partial' | 'unavailable' | 'delayed' | 'stale' | 'unknown'

export type EspnLiveDataQuality = 'high' | 'medium' | 'low' | 'partial' | 'stale' | 'unknown'

export interface EspnLiveFirstContext {
  fixtureId: string
  provider: string
  mode: BestAvailableDataMode
  matchStatus: string
  minute: number | null
  score: string | null
  availableStats: string[]
  availableEvents: string[]
  missingDomains: string[]
  dataQuality: EspnLiveDataQuality
  freshness: string
  estimatedDelayMs: number
  limitations: string[]
}
