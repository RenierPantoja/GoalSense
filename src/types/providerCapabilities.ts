export type ProviderName = 'espn' | 'football_data' | 'api_football' | 'thesportsdb' | 'scorebat'

export type ProviderCapability =
  | 'live_score'
  | 'fixture_schedule'
  | 'team_logos'
  | 'league_logos'
  | 'live_statistics'
  | 'events'
  | 'lineups'
  | 'standings'
  | 'odds'
  | 'predictions'
  | 'videos'
  | 'team_metadata'

export type CapabilityStatus = 'available' | 'partial' | 'unavailable' | 'quota_limited' | 'plan_limited'

export interface CapabilityEntry {
  status: CapabilityStatus
  reason?: string
}

export type ProviderCapabilityMap = Record<ProviderCapability, CapabilityEntry>

// Known capabilities (hardcoded based on real testing)
export const PROVIDER_CAPABILITIES: Record<ProviderName, ProviderCapabilityMap> = {
  espn: {
    live_score: { status: 'available' },
    fixture_schedule: { status: 'available' },
    team_logos: { status: 'available' },
    league_logos: { status: 'partial', reason: 'Nem todas as ligas' },
    live_statistics: { status: 'available' },
    events: { status: 'available' },
    lineups: { status: 'available' },
    standings: { status: 'unavailable' },
    odds: { status: 'unavailable' },
    predictions: { status: 'unavailable' },
    videos: { status: 'unavailable' },
    team_metadata: { status: 'partial' },
  },
  football_data: {
    live_score: { status: 'available' },
    fixture_schedule: { status: 'available' },
    team_logos: { status: 'available' },
    league_logos: { status: 'available' },
    live_statistics: { status: 'unavailable' },
    events: { status: 'unavailable' },
    lineups: { status: 'unavailable' },
    standings: { status: 'available' },
    odds: { status: 'unavailable' },
    predictions: { status: 'unavailable' },
    videos: { status: 'unavailable' },
    team_metadata: { status: 'available' },
  },
  api_football: {
    live_score: { status: 'quota_limited', reason: 'Free tier: 100 req/dia' },
    fixture_schedule: { status: 'quota_limited', reason: 'Free tier: 100 req/dia' },
    team_logos: { status: 'quota_limited', reason: 'Free tier: 100 req/dia' },
    league_logos: { status: 'quota_limited', reason: 'Free tier: 100 req/dia' },
    live_statistics: { status: 'quota_limited', reason: 'Free tier: 100 req/dia' },
    events: { status: 'quota_limited', reason: 'Free tier: 100 req/dia' },
    lineups: { status: 'quota_limited', reason: 'Free tier: 100 req/dia' },
    standings: { status: 'quota_limited', reason: 'Free tier: 100 req/dia' },
    odds: { status: 'quota_limited', reason: 'Free tier: 100 req/dia. Endpoint disponível.' },
    predictions: { status: 'quota_limited', reason: 'Free tier: 100 req/dia. Endpoint disponível.' },
    videos: { status: 'unavailable' },
    team_metadata: { status: 'quota_limited', reason: 'Free tier: 100 req/dia' },
  },
  thesportsdb: {
    live_score: { status: 'unavailable' },
    fixture_schedule: { status: 'unavailable' },
    team_logos: { status: 'available' },
    league_logos: { status: 'partial' },
    live_statistics: { status: 'unavailable' },
    events: { status: 'unavailable' },
    lineups: { status: 'unavailable' },
    standings: { status: 'unavailable' },
    odds: { status: 'unavailable' },
    predictions: { status: 'unavailable' },
    videos: { status: 'unavailable' },
    team_metadata: { status: 'available' },
  },
  scorebat: {
    live_score: { status: 'unavailable' },
    fixture_schedule: { status: 'unavailable' },
    team_logos: { status: 'unavailable' },
    league_logos: { status: 'unavailable' },
    live_statistics: { status: 'unavailable' },
    events: { status: 'unavailable' },
    lineups: { status: 'unavailable' },
    standings: { status: 'unavailable' },
    odds: { status: 'unavailable' },
    predictions: { status: 'unavailable' },
    videos: { status: 'available' },
    team_metadata: { status: 'unavailable' },
  },
}

export function isCapabilityUsable(cap: CapabilityEntry): boolean {
  return cap.status === 'available' || cap.status === 'partial'
}

export function capabilityLabel(status: CapabilityStatus): string {
  const labels: Record<CapabilityStatus, string> = {
    available: 'Disponível',
    partial: 'Parcial',
    unavailable: 'Indisponível',
    quota_limited: 'Limite de quota',
    plan_limited: 'Requer plano superior',
  }
  return labels[status]
}
