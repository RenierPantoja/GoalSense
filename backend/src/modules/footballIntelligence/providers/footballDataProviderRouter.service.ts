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
import type { AcquisitionDomain, DomainFetchResult, FetchParams } from './provider.types.js'

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

  // Budget guard: ESPN reads from already-ingested data (no extra call); external
  // providers that require a key DO count as a provider call.
  if (top.requiresApiKey && opts.allowProviderCall !== false) {
    const budget = guardProviderCall(top.providerName, 'fixture_detail')
    if (budget.blockedByProviderBudget) return emptyResult(domain, 'budget_blocked', [`Orçamento de provider bloqueou ${top.providerName} (${budget.reason}).`], [top.providerName])
  }
  return adapter.fetchDomain(domain, params)
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
    if (p.requiresApiKey && opts.allowProviderCall !== false) {
      const budget = guardProviderCall(p.providerName, 'fixture_detail')
      if (budget.blockedByProviderBudget) { last = emptyResult(domain, 'budget_blocked', [`Orçamento bloqueou ${p.providerName}.`], tried); continue }
    }
    const res = await adapter.fetchDomain(domain, params)
    last = { ...res, providerCandidatesTried: tried }
    if (res.availability === 'available' || res.availability === 'partial') return last
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
