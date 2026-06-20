/**
 * Provider Endpoint Catalog (B44).
 * ─────────────────────────────────────────────────────────────────────────────
 * Declares the endpoints actually known/documented/implemented per provider+domain.
 * `safe_to_call` ONLY when documented + implemented + (key present if required).
 * Undocumented → `blocked_not_documented` (never guessed). Odds → `not_used`.
 */
import { env } from '../../../env.js'
import type { AcquisitionDomain } from './provider.types.js'
import type { ProviderEndpointCatalogEntry, EndpointCallability, ResolvedIds, RequiredId, EndpointSafetyStatus } from './providerEndpointCatalog.types.js'

const flag = (v: unknown) => String(v).toLowerCase() === 'true'
function apiFootballConfigured(): boolean { return !!env.API_FOOTBALL_KEY && env.API_FOOTBALL_KEY.length > 0 && flag(env.ENABLE_PROVIDER_API_FOOTBALL) }

function e(provider: string, domain: AcquisitionDomain, endpointKey: string, implemented: boolean, documented: boolean, requiredIds: RequiredId[], requiresApiKey: boolean, docsReference: string, limitations: string[] = []): ProviderEndpointCatalogEntry {
  return { provider, domain, endpointKey, implemented, documented, requiresApiKey, requiredIds, method: 'GET', safetyStatus: 'safe_to_call', limitations, docsReference }
}

// ESPN — already-ingested live/today data (no key).
const ESPN_ENTRIES: ProviderEndpointCatalogEntry[] = [
  e('espn', 'today_fixtures', 'espn:scoreboard', true, true, [], false, 'espn.provider fetchEspnLiveFixtures'),
  e('espn', 'fixture_details', 'espn:summary', true, true, [], false, 'espn.provider summary'),
  e('espn', 'live_events', 'espn:summary', true, true, [], false, 'espn.provider extractEspnTimedEvents'),
  e('espn', 'live_stats', 'espn:summary', true, true, [], false, 'espn.provider extractEspnStats'),
  e('espn', 'post_match_stats', 'espn:summary', true, true, [], false, 'espn.provider summary'),
]

// API-Football — documented endpoints used by the repo / official + implemented in adapter.
const API_FOOTBALL_ENTRIES: ProviderEndpointCatalogEntry[] = [
  e('api_football', 'today_fixtures', 'af:/fixtures?date=', true, true, ['date'], true, 'api/api-football-* edge fns'),
  e('api_football', 'fixture_details', 'af:/fixtures?id=', true, true, ['fixtureId'], true, 'api/api-football-fixture.ts'),
  e('api_football', 'post_match_stats', 'af:/fixtures/statistics?fixture=', true, true, ['fixtureId'], true, 'api/api-football-fixture.ts'),
  e('api_football', 'confirmed_lineups', 'af:/fixtures/lineups?fixture=', true, true, ['fixtureId'], true, 'API-Football official lineups endpoint'),
  e('api_football', 'standings', 'af:/standings?league=&season=', true, true, ['leagueId', 'season'], true, 'api/api-football-standings.ts'),
  e('api_football', 'injuries', 'af:/injuries?team=&season=', true, true, ['teamId', 'season'], true, 'api/misc.ts api-football-injuries'),
  // Not documented in the project → never called (no guessing).
  e('api_football', 'suspensions', '', false, false, ['teamId'], true, '', ['Endpoint não documentado no projeto.']),
  e('api_football', 'head_to_head', '', false, false, ['teamId'], true, '', ['Endpoint não documentado no projeto.']),
  e('api_football', 'squads', '', false, false, ['teamId'], true, '', ['Endpoint não documentado no projeto.']),
  e('api_football', 'team_form', '', false, false, ['teamId'], true, '', ['Endpoint não documentado no projeto.']),
  e('api_football', 'probable_lineups', '', false, false, ['fixtureId'], true, '', ['Endpoint não documentado no projeto.']),
  e('api_football', 'competition_context', '', false, false, ['leagueId'], true, '', ['Contexto é heurístico; sem endpoint dedicado documentado.']),
]

function applySafety(entry: ProviderEndpointCatalogEntry): ProviderEndpointCatalogEntry {
  let safetyStatus: EndpointSafetyStatus = 'safe_to_call'
  if (!entry.documented || !entry.implemented) safetyStatus = entry.documented ? 'not_implemented' : 'blocked_not_documented'
  else if (entry.requiresApiKey && entry.provider === 'api_football' && !apiFootballConfigured()) safetyStatus = 'blocked_missing_env'
  return { ...entry, safetyStatus }
}

export function listProviderEndpointCatalog(): ProviderEndpointCatalogEntry[] {
  return [...ESPN_ENTRIES, ...API_FOOTBALL_ENTRIES].map(applySafety)
}

export function getEndpointForDomain(provider: string, domain: AcquisitionDomain): ProviderEndpointCatalogEntry | null {
  return listProviderEndpointCatalog().find(c => c.provider === provider && c.domain === domain) ?? null
}

function missingIds(required: RequiredId[], ids: ResolvedIds): RequiredId[] {
  const miss: RequiredId[] = []
  for (const id of required) {
    if (id === 'fixtureId' && !ids.fixtureId) miss.push('fixtureId')
    else if (id === 'leagueId' && !ids.leagueId) miss.push('leagueId')
    else if (id === 'season' && !ids.season) miss.push('season')
    else if (id === 'teamId' && !(ids.homeTeamId && ids.awayTeamId)) miss.push('teamId')
  }
  return miss
}

export function canCallEndpoint(provider: string, domain: AcquisitionDomain, ids: ResolvedIds = {}): EndpointCallability {
  const entry = getEndpointForDomain(provider, domain)
  if (!entry) return { provider, domain, endpointKey: null, callable: false, safetyStatus: 'not_supported', missingIds: [], reasons: ['Provider não cobre o domínio.'] }
  const safe = applySafety(entry)
  if (safe.safetyStatus === 'blocked_not_documented') return { provider, domain, endpointKey: null, callable: false, safetyStatus: 'blocked_not_documented', missingIds: [], reasons: ['Endpoint não documentado — não chamamos.'] }
  if (safe.safetyStatus === 'not_implemented') return { provider, domain, endpointKey: safe.endpointKey, callable: false, safetyStatus: 'not_implemented', missingIds: [], reasons: ['Não implementado.'] }
  if (safe.safetyStatus === 'blocked_missing_env') return { provider, domain, endpointKey: safe.endpointKey, callable: false, safetyStatus: 'blocked_missing_env', missingIds: [], reasons: ['Provider sem env — não chamado.'] }
  const miss = missingIds(safe.requiredIds, ids)
  if (miss.length > 0) return { provider, domain, endpointKey: safe.endpointKey, callable: false, safetyStatus: 'blocked_missing_mapping', missingIds: miss, reasons: [`IDs ausentes: ${miss.join(', ')}.`] }
  return { provider, domain, endpointKey: safe.endpointKey, callable: true, safetyStatus: 'safe_to_call', missingIds: [], reasons: [] }
}

export function explainEndpointBlock(provider: string, domain: AcquisitionDomain, ids: ResolvedIds = {}): string {
  const c = canCallEndpoint(provider, domain, ids)
  return `${provider}/${domain}: ${c.safetyStatus}${c.reasons.length ? ` — ${c.reasons.join('; ')}` : ''}`
}
