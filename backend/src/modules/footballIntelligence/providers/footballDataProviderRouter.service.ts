/**
 * Football Data Provider Router (B40) — route by DOMAIN, not by fixed provider.
 * ─────────────────────────────────────────────────────────────────────────────
 * Picks the best configured provider for a domain, consults the provider budget
 * guard, and falls back to the next provider only if the primary fails/doesn't
 * support it. Never fetches odds. If nobody covers it → provider_not_supported; if
 * nobody is configured → provider_not_configured. Honest reasons always attached.
 */
import { guardProviderCall } from '../../localops/livePipelineGuard.service.js'
import { getAdapter, getProvidersForDomain, listRegisteredProviders } from './providerRegistry.service.js'
import { canFetchDomainForFixture } from '../identity/providerBridge.service.js'
import type { AcquisitionDomain, DomainFetchResult, FetchParams } from './provider.types.js'

const BRIDGE_DOMAINS: AcquisitionDomain[] = ['confirmed_lineups', 'probable_lineups', 'injuries', 'suspensions', 'fixture_details', 'post_match_stats', 'head_to_head']

/** Resolve the external fixture id via the bridge for keyed providers. Returns either a
 * params patch (allow) or a blocked result (no fetch). ESPN/manual are never bridged. */
async function bridgeGate(provider: string, requiresApiKey: boolean, domain: AcquisitionDomain, params: FetchParams): Promise<{ blocked: DomainFetchResult | null; params: FetchParams }> {
  if (!requiresApiKey || provider === 'espn' || provider === 'manual') return { blocked: null, params }
  if (!BRIDGE_DOMAINS.includes(domain) || !params.fixtureId) return { blocked: null, params }
  const decision = await canFetchDomainForFixture(params.fixtureId, domain, provider).catch(() => null)
  if (!decision) return { blocked: null, params }
  if (decision.decision === 'allow_confirmed' && decision.providerFixtureId) {
    return { blocked: null, params: { ...params, resolvedExternalFixtureId: decision.providerFixtureId } }
  }
  const avail = decision.decision === 'blocked_ambiguous_provider_mapping' ? 'blocked_ambiguous_provider_mapping' : 'blocked_missing_provider_mapping'
  return {
    blocked: {
      domain, provider, availability: avail, freshness: 'unknown', dataQuality: 'unavailable',
      fetchedAt: new Date().toISOString(), canonicalData: null, payloadSummary: '', reasons: [decision.reason],
      limitations: ['Rode a resolução de identidade ou confirme o mapping; ou use intake manual.'], providerCandidatesTried: [provider],
    }, params,
  }
}

function emptyResult(domain: AcquisitionDomain, availability: DomainFetchResult['availability'], reasons: string[], tried: string[] = []): DomainFetchResult {
  return {
    domain, provider: null, availability, freshness: 'unknown', dataQuality: 'unavailable',
    fetchedAt: new Date().toISOString(), canonicalData: null, payloadSummary: '', reasons, limitations: [], providerCandidatesTried: tried,
  }
}

export interface FetchDomainOptions { allowProviderCall?: boolean }

/** Fetch one domain from the preferred provider only (no fallback). */
export async function fetchFromPreferredProvider(domain: AcquisitionDomain, params: FetchParams, opts: FetchDomainOptions = {}): Promise<DomainFetchResult> {
  const providers = getProvidersForDomain(domain)
  if (providers.length === 0) {
    const declared = listRegisteredProviders().some(p => p.domains.includes(domain))
    return emptyResult(domain, declared ? 'provider_not_configured' : 'provider_not_supported', [declared ? 'Nenhum provider configurado para o domínio.' : 'Nenhum provider cobre o domínio.'])
  }
  const top = providers[0]
  const adapter = getAdapter(top.providerName)
  if (!adapter) return emptyResult(domain, 'unavailable', ['Adapter não encontrado.'], [top.providerName])

  // B42: bridge gate for fixture-scoped external domains.
  const gate = await bridgeGate(top.providerName, top.requiresApiKey, domain, params)
  if (gate.blocked) return gate.blocked

  // Budget guard: ESPN reads from already-ingested data (no extra call); external
  // providers that require a key DO count as a provider call.
  if (top.requiresApiKey && opts.allowProviderCall !== false) {
    const budget = guardProviderCall(top.providerName, 'fixture_detail')
    if (budget.blockedByProviderBudget) return emptyResult(domain, 'budget_blocked', [`Orçamento de provider bloqueou ${top.providerName} (${budget.reason}).`], [top.providerName])
  }
  return adapter.fetchDomain(domain, gate.params)
}

/** Fetch with fallback: try configured providers in priority order until one returns usable data. */
export async function fetchWithFallback(domain: AcquisitionDomain, params: FetchParams, opts: FetchDomainOptions = {}): Promise<DomainFetchResult> {
  const providers = getProvidersForDomain(domain)
  if (providers.length === 0) {
    const declared = listRegisteredProviders().some(p => p.domains.includes(domain))
    return emptyResult(domain, declared ? 'provider_not_configured' : 'provider_not_supported', [declared ? 'Nenhum provider configurado.' : 'Domínio não suportado por nenhum provider.'])
  }
  const tried: string[] = []
  let last: DomainFetchResult | null = null
  for (const p of providers) {
    const adapter = getAdapter(p.providerName)
    if (!adapter) continue
    tried.push(p.providerName)
    const gate = await bridgeGate(p.providerName, p.requiresApiKey, domain, params)
    if (gate.blocked) { last = { ...gate.blocked, providerCandidatesTried: tried }; continue }
    if (p.requiresApiKey && opts.allowProviderCall !== false) {
      const budget = guardProviderCall(p.providerName, 'fixture_detail')
      if (budget.blockedByProviderBudget) { last = emptyResult(domain, 'budget_blocked', [`Orçamento bloqueou ${p.providerName}.`], tried); continue }
    }
    const res = await adapter.fetchDomain(domain, gate.params)
    last = { ...res, providerCandidatesTried: tried }
    if (res.availability === 'available' || res.availability === 'partial' || res.availability === 'available_empty_confirmed') return last
  }
  return last ?? emptyResult(domain, 'unavailable', ['Todos os providers falharam.'], tried)
}

/** Default fetch entry: with fallback. */
export async function fetchDomain(domain: AcquisitionDomain, params: FetchParams, opts: FetchDomainOptions = {}): Promise<DomainFetchResult> {
  return fetchWithFallback(domain, params, opts)
}

export function explainFetchDecision(domain: AcquisitionDomain): string {
  const providers = getProvidersForDomain(domain)
  if (providers.length === 0) return `Sem provider configurado para ${domain} — busca não será feita.`
  return `Busca de ${domain} tentará: ${providers.map(p => p.providerName).join(' → ')} (fallback por prioridade).`
}
