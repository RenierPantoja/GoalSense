/**
 * Provider Capability Matrix — contracts (Match Intelligence Fabric).
 * ─────────────────────────────────────────────────────────────────────────────
 * Honest map of what a provider can deliver per data domain. Never invents
 * coverage: unknown is unknown, unavailable is unavailable, and odds are
 * explicitly `not_used` (by product design), not a critical gap.
 */

export type IntelligenceDomain =
  | 'fixtures' | 'live_score' | 'live_events' | 'live_stats'
  | 'lineups' | 'probable_lineups' | 'confirmed_lineups'
  | 'squads' | 'players' | 'player_stats' | 'team_stats'
  | 'injuries' | 'suspensions' | 'cards' | 'yellow_cards' | 'red_cards'
  | 'standings' | 'table_context' | 'team_form' | 'head_to_head'
  | 'referee' | 'venue' | 'competition_stage' | 'knockout_context' | 'aggregate_score'
  | 'post_match_stats' | 'substitutions' | 'tactical_events'
  | 'weather' | 'travel' | 'rest_days'
  | 'market' | 'odds'

export type CoverageLevel = 'full' | 'partial' | 'limited' | 'unavailable' | 'unknown' | 'not_used'
export type Reliability = 'high' | 'medium' | 'low' | 'unknown'
export type Freshness = 'realtime' | 'near_realtime' | 'delayed' | 'pre_match_only' | 'post_match_only' | 'unknown'

export interface DomainCapability {
  domain: IntelligenceDomain
  coverage: CoverageLevel
  reliability: Reliability
  freshness: Freshness
  /** Honest note: how/where this is (or is not) collected by the backend. */
  note: string
  /** When coverage is unavailable/limited, an honest reason. */
  reason?: 'provider_not_supported' | 'not_collected_yet' | 'not_used_by_design' | 'edge_function_only' | 'partial_only' | 'unknown'
}

export interface ProviderCapabilities {
  provider: string
  generatedAt: string
  domains: Record<IntelligenceDomain, DomainCapability>
  limitations: string[]
}

export interface ProviderReliabilityReport {
  generatedAt: string
  providers: Array<{
    provider: string
    fullDomains: number
    partialDomains: number
    unavailableDomains: number
    notUsedDomains: number
    overallReliability: Reliability
  }>
  limitations: string[]
}

export interface DomainAnalyzability {
  domain: IntelligenceDomain
  canAnalyze: boolean
  coverage: CoverageLevel
  reliability: Reliability
  explanation: string
}
