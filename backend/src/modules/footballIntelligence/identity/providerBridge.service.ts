/**
 * Provider Bridge (B42).
 * ─────────────────────────────────────────────────────────────────────────────
 * Given an ESPN/canonical fixture, returns the external provider ids available via
 * CONFIRMED mappings. Only a confirmed (manual or auto) mapping unblocks a critical
 * fetch. Candidate/ambiguous never unblock critical domains (preview only, flagged
 * unsafe_candidate). Never guesses an id.
 */
import { getBestMappingForFixture } from './fixtureIdentityResolution.service.js'
import type { AcquisitionDomain } from '../providers/provider.types.js'

const CRITICAL_FIXTURE_DOMAINS: AcquisitionDomain[] = ['confirmed_lineups', 'probable_lineups', 'injuries', 'suspensions', 'fixture_details', 'post_match_stats', 'head_to_head']

export type BridgeFetchDecision =
  | 'allow_confirmed' | 'blocked_missing_provider_mapping' | 'blocked_ambiguous_provider_mapping'
  | 'preview_unsafe_candidate' | 'not_a_fixture_domain'

export interface ProviderIdsForFixture {
  fixtureId: string
  provider: string
  providerFixtureId: string | null
  mappingStatus: string | null
  mappingConfidence: number | null
  mappingBand: string | null
}

export async function getProviderFixtureId(fixtureId: string, provider = 'api_football'): Promise<ProviderIdsForFixture> {
  const m = await getBestMappingForFixture(fixtureId, provider).catch(() => null)
  return {
    fixtureId, provider,
    providerFixtureId: m && (m.status === 'manually_confirmed' || m.status === 'auto_confirmed') ? m.secondaryProviderEntityId : null,
    mappingStatus: m?.status ?? null, mappingConfidence: m?.confidenceScore ?? null, mappingBand: m?.confidenceBand ?? null,
  }
}

export async function getProviderIdsForFixture(fixtureId: string, provider = 'api_football'): Promise<ProviderIdsForFixture> {
  return getProviderFixtureId(fixtureId, provider)
}

export interface CanFetchResult {
  decision: BridgeFetchDecision
  providerFixtureId: string | null
  mappingStatus: string | null
  reason: string
}

export async function canFetchDomainForFixture(fixtureId: string, domain: AcquisitionDomain, provider = 'api_football'): Promise<CanFetchResult> {
  if (!CRITICAL_FIXTURE_DOMAINS.includes(domain)) return { decision: 'not_a_fixture_domain', providerFixtureId: null, mappingStatus: null, reason: 'Domínio não depende de mapping de fixture.' }
  const ids = await getProviderFixtureId(fixtureId, provider)
  if (ids.providerFixtureId) return { decision: 'allow_confirmed', providerFixtureId: ids.providerFixtureId, mappingStatus: ids.mappingStatus, reason: 'Mapping confirmado — fetch liberado.' }
  if (ids.mappingStatus === 'ambiguous') return { decision: 'blocked_ambiguous_provider_mapping', providerFixtureId: null, mappingStatus: 'ambiguous', reason: 'Mapping ambíguo — requer revisão do operador.' }
  if (ids.mappingStatus === 'candidate') return { decision: 'preview_unsafe_candidate', providerFixtureId: null, mappingStatus: 'candidate', reason: 'Apenas candidate — não libera fetch crítico (preview unsafe).' }
  return { decision: 'blocked_missing_provider_mapping', providerFixtureId: null, mappingStatus: ids.mappingStatus, reason: 'Sem mapping confirmado — rode a resolução de identidade.' }
}

export async function explainBlockedDomain(fixtureId: string, domain: AcquisitionDomain, provider = 'api_football'): Promise<string> {
  const r = await canFetchDomainForFixture(fixtureId, domain, provider)
  return `${domain}: ${r.decision} — ${r.reason}`
}
