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

// ─── Provider Bridge V2 (B43) — team/league/season unlock ──────────────────────
import { createRepositories } from '../../../repositories/index.js'
import { getAdapter } from '../providers/providerRegistry.service.js'
import { normalizeTeamName, normalizeCompetitionName } from './providerIdentity.util.js'
import type { DomainUnlockStatus, DomainUnlockState, ProviderTeamMapping, ProviderCompetitionMapping } from './providerIdentity.types.js'

const CONFIRMED = new Set(['manually_confirmed', 'auto_confirmed'])
// Domains whose API-Football endpoint is documented in the repo (safe to implement).
const ENDPOINT_IMPLEMENTED: Record<string, boolean> = {
  fixture_details: true, post_match_stats: true, confirmed_lineups: true, standings: true, injuries: true,
  probable_lineups: false, suspensions: false, head_to_head: false, squads: false, team_form: false, competition_context: false,
}

async function confirmedTeamMappingFor(name: string, provider: string): Promise<ProviderTeamMapping | null> {
  if (!name) return null
  const key = normalizeTeamName(name)
  const all = await createRepositories().intelligence.listProviderTeamMappings(1000).catch(() => [])
  const match = all.find(m => m.secondaryProvider === provider && m.canonicalTeamId === key)
  return match ?? null
}
async function confirmedCompetitionMappingFor(competition: string, provider: string): Promise<ProviderCompetitionMapping | null> {
  if (!competition) return null
  const key = normalizeCompetitionName(competition)
  const all = await createRepositories().intelligence.listProviderCompetitionMappings(1000).catch(() => [])
  const match = all.find(m => m.secondaryProvider === provider && m.canonicalCompetitionId === key)
  return match ?? null
}

export async function getProviderTeamId(teamName: string, provider = 'api_football'): Promise<{ teamId: string | null; status: string | null }> {
  const m = await confirmedTeamMappingFor(teamName, provider)
  return { teamId: m && CONFIRMED.has(m.status) ? m.secondaryProviderTeamId : null, status: m?.status ?? null }
}
export async function getProviderLeagueId(competition: string, provider = 'api_football'): Promise<{ leagueId: string | null; season: string | null; status: string | null }> {
  const m = await confirmedCompetitionMappingFor(competition, provider)
  return { leagueId: m && CONFIRMED.has(m.status) ? m.secondaryProviderCompetitionId : null, season: m?.season ?? null, status: m?.status ?? null }
}
export async function getProviderHomeAwayTeamIdsForFixture(fixtureId: string, provider = 'api_football'): Promise<{ homeTeamId: string | null; awayTeamId: string | null; homeStatus: string | null; awayStatus: string | null }> {
  const fx = await createRepositories().fixtures.findById(fixtureId).catch(() => null)
  if (!fx) return { homeTeamId: null, awayTeamId: null, homeStatus: null, awayStatus: null }
  const [h, a] = await Promise.all([getProviderTeamId(fx.homeName, provider), getProviderTeamId(fx.awayName, provider)])
  return { homeTeamId: h.teamId, awayTeamId: a.teamId, homeStatus: h.status, awayStatus: a.status }
}
export async function getProviderCompetitionContextForFixture(fixtureId: string, provider = 'api_football'): Promise<{ leagueId: string | null; season: string | null; status: string | null }> {
  const fx = await createRepositories().fixtures.findById(fixtureId).catch(() => null)
  if (!fx) return { leagueId: null, season: null, status: null }
  return getProviderLeagueId(fx.competition, provider)
}

function ambiguous(status: string | null | undefined): boolean { return status === 'ambiguous' }

export async function getDomainUnlockStatus(fixtureId: string, domain: string, provider = 'api_football'): Promise<DomainUnlockStatus> {
  const reasons: string[] = []
  const required: DomainUnlockStatus['requiredMappings'] = []
  const suggested: DomainUnlockStatus['suggestedActions'] = []
  const adapter = getAdapter(provider)
  let state: DomainUnlockState = 'unlocked'

  if (!adapter || !adapter.isConfigured()) {
    return { domain, fixtureId, provider, requiredMappings: required, currentStatus: 'blocked_provider_not_configured', reasons: ['Provider não configurado — não chamado.'], suggestedActions: ['configure_provider'] }
  }
  if (ENDPOINT_IMPLEMENTED[domain] === false) {
    return { domain, fixtureId, provider, requiredMappings: required, currentStatus: 'blocked_endpoint_not_implemented', reasons: ['Endpoint não documentado no projeto — sem chute.'], suggestedActions: ['use_manual_intake'] }
  }

  if (domain === 'fixture_details' || domain === 'post_match_stats' || domain === 'confirmed_lineups') {
    required.push('fixture')
    const ids = await getProviderFixtureId(fixtureId, provider)
    if (ids.providerFixtureId) state = 'unlocked'
    else if (ids.mappingStatus === 'ambiguous') { state = 'blocked_ambiguous_mapping'; reasons.push('Mapping de fixture ambíguo.'); suggested.push('confirm_mapping') }
    else { state = 'blocked_missing_mapping'; reasons.push('Sem mapping de fixture confirmado.'); suggested.push('run_identity_resolution') }
  } else if (domain === 'standings') {
    required.push('league', 'season')
    const league = await getProviderCompetitionContextForFixture(fixtureId, provider)
    if (league.leagueId && league.season) state = 'unlocked'
    else if (ambiguous(league.status)) { state = 'blocked_ambiguous_mapping'; reasons.push('Mapping de liga ambíguo.'); suggested.push('confirm_mapping') }
    else { state = 'blocked_missing_mapping'; reasons.push(league.leagueId ? 'Season ausente.' : 'Sem mapping de liga confirmado.'); suggested.push('run_entity_mapping_derivation', 'confirm_mapping') }
  } else if (domain === 'injuries') {
    required.push('home_team', 'away_team')
    const ids = await getProviderHomeAwayTeamIdsForFixture(fixtureId, provider)
    if (ids.homeTeamId && ids.awayTeamId) state = 'unlocked'
    else if (ambiguous(ids.homeStatus) || ambiguous(ids.awayStatus)) { state = 'blocked_ambiguous_mapping'; reasons.push('Mapping de time ambíguo.'); suggested.push('confirm_mapping') }
    else { state = 'blocked_missing_mapping'; reasons.push('Faltam mappings de time confirmados.'); suggested.push('run_entity_mapping_derivation', 'confirm_mapping') }
  } else {
    state = 'blocked_endpoint_not_implemented'; reasons.push('Domínio não habilitado nesta fase.'); suggested.push('use_manual_intake')
  }

  if (suggested.length === 0) suggested.push('none')
  return { domain, fixtureId, provider, requiredMappings: required, currentStatus: state, reasons, suggestedActions: suggested }
}

export async function canFetchDomainForFixtureV2(fixtureId: string, domain: string, provider = 'api_football'): Promise<{ allow: boolean; status: DomainUnlockState; resolvedFixtureId: string | null; resolvedLeagueId: string | null; resolvedSeason: string | null; resolvedHomeTeamId: string | null; resolvedAwayTeamId: string | null }> {
  const unlock = await getDomainUnlockStatus(fixtureId, domain, provider)
  if (unlock.currentStatus !== 'unlocked') return { allow: false, status: unlock.currentStatus, resolvedFixtureId: null, resolvedLeagueId: null, resolvedSeason: null, resolvedHomeTeamId: null, resolvedAwayTeamId: null }
  const fixtureIds = (domain === 'fixture_details' || domain === 'post_match_stats' || domain === 'confirmed_lineups') ? await getProviderFixtureId(fixtureId, provider) : { providerFixtureId: null }
  const league = domain === 'standings' ? await getProviderCompetitionContextForFixture(fixtureId, provider) : { leagueId: null, season: null }
  const teams = domain === 'injuries' ? await getProviderHomeAwayTeamIdsForFixture(fixtureId, provider) : { homeTeamId: null, awayTeamId: null }
  return { allow: true, status: 'unlocked', resolvedFixtureId: fixtureIds.providerFixtureId, resolvedLeagueId: league.leagueId, resolvedSeason: league.season, resolvedHomeTeamId: teams.homeTeamId, resolvedAwayTeamId: teams.awayTeamId }
}

export async function explainDomainUnlockStatus(fixtureId: string, domain: string, provider = 'api_football'): Promise<string> {
  const s = await getDomainUnlockStatus(fixtureId, domain, provider)
  return `${domain}: ${s.currentStatus}${s.reasons.length ? ` — ${s.reasons.join('; ')}` : ''}`
}

// ─── Domain Unlock Matrix V2 (B44) — catalog + mappings + resolved ids ─────────
import { getEndpointForDomain, canCallEndpoint } from '../providers/providerEndpointCatalog.service.js'
import { listManualRecordsForFixture } from '../manualIntelligenceIntake.service.js'

const MATRIX_DOMAINS: AcquisitionDomain[] = ['fixture_details', 'today_fixtures', 'standings', 'head_to_head', 'squads', 'injuries', 'suspensions', 'confirmed_lineups', 'probable_lineups', 'team_form', 'post_match_stats', 'competition_context']
const MANUAL_FOR_DOMAIN: Record<string, string> = { confirmed_lineups: 'lineup', probable_lineups: 'lineup', injuries: 'injury', suspensions: 'suspension', squads: 'squad', standings: 'context', competition_context: 'context' }

async function resolveIdsForDomain(fixtureId: string, domain: AcquisitionDomain, provider: string) {
  const ids: { fixtureId?: string | null; homeTeamId?: string | null; awayTeamId?: string | null; leagueId?: string | null; season?: string | null } = {}
  if (['fixture_details', 'post_match_stats', 'confirmed_lineups', 'probable_lineups'].includes(domain)) {
    const f = await getProviderFixtureId(fixtureId, provider); ids.fixtureId = f.providerFixtureId
  }
  if (domain === 'standings' || domain === 'competition_context') {
    const l = await getProviderCompetitionContextForFixture(fixtureId, provider); ids.leagueId = l.leagueId; ids.season = l.season
  }
  if (['injuries', 'suspensions', 'squads', 'head_to_head', 'team_form'].includes(domain)) {
    const t = await getProviderHomeAwayTeamIdsForFixture(fixtureId, provider); ids.homeTeamId = t.homeTeamId; ids.awayTeamId = t.awayTeamId
  }
  return ids
}

export async function getDomainUnlockStatusV2(fixtureId: string, domain: string, provider = 'api_football'): Promise<DomainUnlockStatus> {
  const baseV1 = await getDomainUnlockStatus(fixtureId, domain, provider)
  const d = domain as AcquisitionDomain
  const entry = getEndpointForDomain(provider, d)
  const ids = await resolveIdsForDomain(fixtureId, d, provider).catch(() => ({}))
  const callability = canCallEndpoint(provider, d, ids)
  const manual = await listManualRecordsForFixture(fixtureId, 100).catch(() => [])
  const manualKind = MANUAL_FOR_DOMAIN[domain]
  const manualFallbackAvailable = !!manualKind && (manual as any[]).some(m => m.domain === manualKind)

  let recommendedNextAction: DomainUnlockStatus['recommendedNextAction'] = 'stay_out'
  if (baseV1.currentStatus === 'unlocked' && callability.callable) recommendedNextAction = 'ready_to_fetch'
  else if (callability.safetyStatus === 'blocked_missing_env') recommendedNextAction = 'configure_provider'
  else if (callability.safetyStatus === 'blocked_not_documented' || callability.safetyStatus === 'not_implemented' || callability.safetyStatus === 'not_supported') recommendedNextAction = manualFallbackAvailable ? 'use_manual_intake' : 'provide_endpoint_docs'
  else if (callability.missingIds.includes('fixtureId')) recommendedNextAction = 'run_fixture_mapping'
  else if (callability.missingIds.length > 0) recommendedNextAction = baseV1.currentStatus === 'blocked_ambiguous_mapping' ? 'confirm_mapping' : 'run_entity_mapping'
  else if (manualFallbackAvailable) recommendedNextAction = 'use_manual_intake'

  return {
    ...baseV1,
    endpointStatus: callability.safetyStatus,
    endpointKey: callability.endpointKey,
    endpointImplemented: entry?.implemented ?? false,
    endpointDocumented: entry?.documented ?? false,
    idsResolved: ids,
    idsMissing: callability.missingIds,
    manualFallbackAvailable,
    recommendedNextAction,
  }
}

export async function getAllDomainUnlockStatuses(fixtureId: string, provider = 'api_football'): Promise<DomainUnlockStatus[]> {
  return Promise.all(MATRIX_DOMAINS.map(d => getDomainUnlockStatusV2(fixtureId, d, provider)))
}

export async function explainDomainUnlockMatrix(fixtureId: string, provider = 'api_football'): Promise<string> {
  const all = await getAllDomainUnlockStatuses(fixtureId, provider)
  return all.map(s => `${s.domain}: ${s.currentStatus}/${s.endpointStatus} → ${s.recommendedNextAction}`).join(' | ')
}

export { MATRIX_DOMAINS }
