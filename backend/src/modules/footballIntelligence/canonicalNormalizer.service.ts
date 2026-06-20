/**
 * Canonical Normalizer V2 (B44).
 * ─────────────────────────────────────────────────────────────────────────────
 * Maps a provider DomainFetchResult into a uniform canonical envelope with full
 * provenance. Empty list only as `available_empty_confirmed`; absent ≠ zero; partial
 * stays partial. No giant raw payloads — only a short rawSummary.
 */
import type { DomainFetchResult, FetchAvailability } from './providers/provider.types.js'

export type CanonicalReliability = 'high' | 'medium' | 'low' | 'unknown'

export interface CanonicalDomainEnvelope {
  domain: string
  provider: string | null
  providerIds: Record<string, string | null>
  fetchedAt: string
  freshness: string
  availability: FetchAvailability
  dataQuality: string
  reliability: CanonicalReliability
  source: 'provider' | 'manual' | 'none'
  confirmedEmpty: boolean
  rawSummary: string
  limitations: string[]
}

function reliabilityFor(r: DomainFetchResult): CanonicalReliability {
  if (r.availability === 'available') return r.provider === 'espn' ? 'medium' : 'medium'
  if (r.availability === 'partial' || r.availability === 'available_empty_confirmed') return 'low'
  return 'unknown'
}

export function normalizeDomainResult(result: DomainFetchResult, providerIds: Record<string, string | null> = {}): CanonicalDomainEnvelope {
  return {
    domain: result.domain,
    provider: result.provider,
    providerIds,
    fetchedAt: result.fetchedAt,
    freshness: result.freshness,
    availability: result.availability,
    dataQuality: result.dataQuality,
    reliability: reliabilityFor(result),
    source: result.provider === 'manual' ? 'manual' : (result.availability === 'available' || result.availability === 'partial' || result.availability === 'available_empty_confirmed') ? 'provider' : 'none',
    confirmedEmpty: result.availability === 'available_empty_confirmed',
    rawSummary: (result.payloadSummary || '').slice(0, 280),
    limitations: result.limitations ?? [],
  }
}

/** True when the result represents real, usable data (incl. confirmed-empty). */
export function isUsable(result: DomainFetchResult): boolean {
  return result.availability === 'available' || result.availability === 'partial' || result.availability === 'available_empty_confirmed'
}
