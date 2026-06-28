import type { EspnLiveDataQuality } from './espnLiveFirst.types.js'

export interface CanonicalLiveSnapshot {
  fixtureId: string
  provider: string
  fetchedAt: string
  status: string
  minute: number | null
  score: { home: number; away: number } | null
  period: string
  stats: {
    possession?: { home: number; away: number }
    shots?: { home: number; away: number }
    shotsOnTarget?: { home: number; away: number }
    corners?: { home: number; away: number }
    fouls?: { home: number; away: number }
    yellowCards?: { home: number; away: number }
    redCards?: { home: number; away: number }
    attacks?: { home: number; away: number }
  }
  events: any[]
  recentEvents: any[]
  dataQuality: EspnLiveDataQuality
  freshness: string // e.g., "fresh", "stale"
  estimatedDelayMs: number
  missingFields: string[]
  limitations: string[]
}

export function normalizeEspnLiveSnapshot(fixtureId: string, rawEspnData: any, fetchedAt: string): CanonicalLiveSnapshot {
  const missingFields: string[] = []
  const limitations: string[] = []

  // Minimal mocking of parsing logic based on generic ESPN structure
  // In a real scenario, this parses rawEspnData.header, rawEspnData.competitors, etc.
  const isLive = rawEspnData?.status === 'in_progress' || rawEspnData?.status === 'half_time'
  const minute = rawEspnData?.minute ?? null

  if (minute === null && isLive) missingFields.push('minute')

  const stats = rawEspnData?.stats ?? {}
  if (!stats.possession) missingFields.push('possession')
  if (!stats.shots) missingFields.push('shots')

  const dataQuality: EspnLiveDataQuality = isLive ? (missingFields.length > 2 ? 'partial' : 'high') : 'unknown'
  const freshness = 'fresh' // Assuming it was just fetched
  const estimatedDelayMs = 120000 // 2 minutes generic delay

  return {
    fixtureId,
    provider: 'espn',
    fetchedAt,
    status: rawEspnData?.status ?? 'unknown',
    minute,
    score: rawEspnData?.score ?? null,
    period: rawEspnData?.period ?? '1',
    stats,
    events: rawEspnData?.events ?? [],
    recentEvents: rawEspnData?.recentEvents ?? [],
    dataQuality,
    freshness,
    estimatedDelayMs,
    missingFields,
    limitations
  }
}
