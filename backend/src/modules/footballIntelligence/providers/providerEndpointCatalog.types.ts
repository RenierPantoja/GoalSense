/**
 * Provider Endpoint Catalog — contracts (B44).
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for which provider endpoints are REALLY known, documented
 * and safe to call. The router/acquisition consult this instead of scattered logic.
 * Odds is never catalogued as callable.
 */
import type { AcquisitionDomain } from './provider.types.js'

export type EndpointSafetyStatus =
  | 'safe_to_call' | 'blocked_missing_env' | 'blocked_missing_mapping'
  | 'blocked_not_documented' | 'not_supported' | 'not_implemented' | 'not_used'

export type RequiredId = 'fixtureId' | 'teamId' | 'leagueId' | 'season' | 'country' | 'date'

export interface ProviderEndpointCatalogEntry {
  provider: string
  domain: AcquisitionDomain
  endpointKey: string
  implemented: boolean
  documented: boolean
  requiresApiKey: boolean
  requiredIds: RequiredId[]
  method: 'GET'
  safetyStatus: EndpointSafetyStatus
  limitations: string[]
  docsReference: string
}

export interface ResolvedIds {
  fixtureId?: string | null
  homeTeamId?: string | null
  awayTeamId?: string | null
  leagueId?: string | null
  season?: string | null
}

export interface EndpointCallability {
  provider: string
  domain: AcquisitionDomain
  endpointKey: string | null
  callable: boolean
  safetyStatus: EndpointSafetyStatus
  missingIds: RequiredId[]
  reasons: string[]
}
