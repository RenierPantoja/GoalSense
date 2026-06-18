/**
 * Data-availability discipline helpers.
 * ─────────────────────────────────────────────────────────────────────────────
 * Keep the future memory clean: absence of data must be VISIBLE and never faked.
 * `0` is only used when the provider reported zero — otherwise the value stays
 * null and the availability is `unavailable` with a reason.
 */
import type { DataAvailability, DataAvailabilityMap, DataQuality, UnavailableReason } from '../contracts/intelligence.types.js'

export function markAvailable(source: string, quality: DataQuality = 'partial'): DataAvailability {
  return { available: true, source, quality }
}

export function markUnavailable(reason: UnavailableReason, source: string | null = null): DataAvailability {
  return { available: false, source, quality: 'unknown', unavailableReason: reason }
}

/** Infer a coarse provider quality from a snapshot-like object. */
export function inferProviderQuality(snapshot: { dataQuality?: string | null; stats?: unknown; events?: unknown } | null | undefined): DataQuality {
  if (!snapshot) return 'unknown'
  const q = snapshot.dataQuality
  if (q === 'rich' || q === 'partial' || q === 'poor') return q
  if (snapshot.stats || snapshot.events) return 'partial'
  return 'unknown'
}

/**
 * Build the availability map for the data the engine touches today. Everything
 * the current API cannot deliver is explicitly recorded as unavailable with a
 * reason — this is the seam future phases (rich pre-match, H2H, standings,
 * lineups, odds) will fill in without contaminating the record now.
 */
export function buildLiveAvailabilityMap(input: {
  provider?: string | null
  dataQuality?: string | null
  stats?: unknown
  events?: unknown
}): DataAvailabilityMap {
  const provider = input.provider || null
  const hasStats = !!input.stats
  const hasEvents = Array.isArray(input.events) ? input.events.length > 0 : !!input.events
  const liveQuality = inferProviderQuality(input)

  return {
    liveScore: markAvailable(provider || 'live', 'rich'),
    liveStats: hasStats ? markAvailable(provider || 'live', liveQuality) : markUnavailable('not_collected_yet', provider),
    timedEvents: hasEvents ? markAvailable(provider || 'live', liveQuality) : markUnavailable('not_collected_yet', provider),
    xg: markUnavailable('provider_not_supported', provider),
    dangerousAttacks: markUnavailable('provider_not_supported', provider),
    preMatch: markUnavailable('not_collected_yet', null),
    headToHead: markUnavailable('not_collected_yet', null),
    standings: markUnavailable('not_collected_yet', null),
    lineups: markUnavailable('not_collected_yet', null),
    injuries: markUnavailable('not_collected_yet', null),
    odds: markUnavailable('not_collected_yet', null),
  }
}

/** Names of the data fields that are missing in the given map. */
export function collectMissingData(map: DataAvailabilityMap): string[] {
  return Object.entries(map).filter(([, v]) => !v.available).map(([k]) => k)
}
