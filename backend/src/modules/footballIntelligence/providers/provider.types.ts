/**
 * Multi-provider registry + domain router — contracts (B40).
 * ─────────────────────────────────────────────────────────────────────────────
 * Honest provider capability registry and per-domain routing. Never invents
 * capability; a provider without env is `configured=false` and is never called.
 * Odds is never a routed domain.
 */
import type { IntelligenceDomain } from '../providerCapability.types.js'

export type AcquisitionDomain =
  | 'today_fixtures' | 'fixture_details' | 'standings' | 'team_form' | 'head_to_head'
  | 'squads' | 'injuries' | 'suspensions' | 'probable_lineups' | 'confirmed_lineups'
  | 'live_events' | 'live_stats' | 'post_match_stats' | 'competition_context'

export type FetchAvailability =
  | 'available' | 'partial' | 'unavailable' | 'provider_not_supported'
  | 'provider_not_configured' | 'not_available_yet' | 'budget_blocked' | 'unknown'

export type Freshness = 'realtime' | 'near_realtime' | 'fresh' | 'stale' | 'pre_match_only' | 'unknown'

export interface ProviderRegistryEntry {
  providerName: string
  enabled: boolean
  configured: boolean
  priority: number
  domains: AcquisitionDomain[]
  rateLimitProfile: 'generous' | 'moderate' | 'tight' | 'unknown'
  costRisk: 'none' | 'low' | 'medium' | 'high'
  requiresApiKey: boolean
  supportsTodayFixtures: boolean
  supportsLineups: boolean
  supportsInjuries: boolean
  supportsSuspensions: boolean
  supportsStandings: boolean
  supportsH2H: boolean
  supportsSquads: boolean
  supportsPostMatch: boolean
  limitations: string[]
}

export interface DomainFetchResult<T = unknown> {
  domain: AcquisitionDomain
  provider: string | null
  availability: FetchAvailability
  freshness: Freshness
  dataQuality: 'rich' | 'partial' | 'poor' | 'unavailable' | 'unknown'
  fetchedAt: string
  canonicalData: T | null
  payloadSummary: string
  reasons: string[]
  limitations: string[]
  providerCandidatesTried: string[]
}

export interface ProviderAdapter {
  providerName: string
  isConfigured(): boolean
  isEnabled(): boolean
  supportedDomains(): AcquisitionDomain[]
  describe(): ProviderRegistryEntry
  /** Fetch one domain. MUST be non-fatal and honest; never invents data. */
  fetchDomain(domain: AcquisitionDomain, params: FetchParams): Promise<DomainFetchResult>
}

export interface FetchParams {
  fixtureId?: string
  homeTeam?: string
  awayTeam?: string
  competition?: string
  date?: string
  providerFixtureId?: string | null
}

export interface ProviderStackReport {
  generatedAt: string
  registered: ProviderRegistryEntry[]
  configured: string[]
  unconfigured: string[]
  domainCoverage: Record<string, { providers: string[]; bestProvider: string | null; supported: boolean }>
  limitations: string[]
}

/** Map an acquisition domain to the closest capability domain for explanations. */
export const ACQUISITION_TO_CAPABILITY: Record<AcquisitionDomain, IntelligenceDomain> = {
  today_fixtures: 'fixtures', fixture_details: 'fixtures', standings: 'standings',
  team_form: 'team_form', head_to_head: 'head_to_head', squads: 'squads',
  injuries: 'injuries', suspensions: 'suspensions', probable_lineups: 'probable_lineups',
  confirmed_lineups: 'confirmed_lineups', live_events: 'live_events', live_stats: 'live_stats',
  post_match_stats: 'post_match_stats', competition_context: 'competition_stage',
}

export const ALL_ACQUISITION_DOMAINS: AcquisitionDomain[] = [
  'today_fixtures', 'fixture_details', 'standings', 'team_form', 'head_to_head',
  'squads', 'injuries', 'suspensions', 'probable_lineups', 'confirmed_lineups',
  'live_events', 'live_stats', 'post_match_stats', 'competition_context',
]
