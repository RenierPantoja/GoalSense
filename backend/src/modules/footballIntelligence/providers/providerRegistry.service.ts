/**
 * Multi-provider Registry (B40).
 * ─────────────────────────────────────────────────────────────────────────────
 * Knows which providers exist and what they can really do. ESPN is wired; the rest
 * are honest skeletons that are only "configured" when their env/credential is set
 * (and never called otherwise). No invented capability, no odds.
 */
import { EspnFootballProviderAdapter } from './adapters/espnFootballProvider.adapter.js'
import { createApiFootballAdapter } from './adapters/apiFootballProvider.adapter.js'
import { createSportmonksAdapter } from './adapters/sportmonksProvider.adapter.js'
import { createFootballDataOrgAdapter } from './adapters/footballDataOrgProvider.adapter.js'
import { ManualLocalProviderAdapter } from './adapters/manualLocalProvider.adapter.js'
import type { AcquisitionDomain, ProviderAdapter, ProviderRegistryEntry, ProviderStackReport } from './provider.types.js'
import { ALL_ACQUISITION_DOMAINS } from './provider.types.js'

let adapters: ProviderAdapter[] | null = null
function getAdapters(): ProviderAdapter[] {
  if (!adapters) {
    adapters = [
      new EspnFootballProviderAdapter(),
      createApiFootballAdapter(),
      createSportmonksAdapter(),
      createFootballDataOrgAdapter(),
      new ManualLocalProviderAdapter(),
    ]
  }
  return adapters
}

export function getAdapter(providerName: string): ProviderAdapter | null {
  return getAdapters().find(a => a.providerName === providerName) ?? null
}

export function listRegisteredProviders(): ProviderRegistryEntry[] {
  return getAdapters().map(a => a.describe()).sort((x, y) => x.priority - y.priority)
}

export function listConfiguredProviders(): ProviderRegistryEntry[] {
  return listRegisteredProviders().filter(p => p.configured && p.enabled)
}

/** Best provider for a domain: configured + enabled + supports the domain, lowest priority number wins. */
export function getBestProviderForDomain(domain: AcquisitionDomain): ProviderRegistryEntry | null {
  const candidates = listRegisteredProviders().filter(p => p.configured && p.enabled && p.domains.includes(domain))
  return candidates.length ? candidates[0] : null
}

export function getProvidersForDomain(domain: AcquisitionDomain): ProviderRegistryEntry[] {
  return listRegisteredProviders().filter(p => p.configured && p.enabled && p.domains.includes(domain))
}

export function explainProviderSelection(domain: AcquisitionDomain): string {
  const best = getBestProviderForDomain(domain)
  if (best) return `Domínio ${domain}: provider preferido = ${best.providerName} (prioridade ${best.priority}).`
  const declared = listRegisteredProviders().filter(p => p.domains.includes(domain))
  if (declared.length === 0) return `Domínio ${domain}: nenhum provider declara suporte → provider_not_supported.`
  return `Domínio ${domain}: ${declared.map(p => p.providerName).join(', ')} declaram suporte, mas nenhum está configurado/habilitado.`
}

export function explainProviderMissing(domain: AcquisitionDomain): string | null {
  if (getBestProviderForDomain(domain)) return null
  const declared = listRegisteredProviders().filter(p => p.domains.includes(domain))
  if (declared.length === 0) return `${domain}: provider_not_supported (ninguém cobre).`
  return `${domain}: nenhum provider configurado (${declared.map(p => p.providerName).join('/')} exigem env).`
}

export function buildProviderStackReport(): ProviderStackReport {
  const registered = listRegisteredProviders()
  const domainCoverage: ProviderStackReport['domainCoverage'] = {}
  for (const d of ALL_ACQUISITION_DOMAINS) {
    const providers = getProvidersForDomain(d).map(p => p.providerName)
    const best = getBestProviderForDomain(d)
    const supported = registered.some(p => p.domains.includes(d))
    domainCoverage[d] = { providers, bestProvider: best?.providerName ?? null, supported }
  }
  return {
    generatedAt: new Date().toISOString(),
    registered,
    configured: registered.filter(p => p.configured && p.enabled).map(p => p.providerName),
    unconfigured: registered.filter(p => !p.configured || !p.enabled).map(p => p.providerName),
    domainCoverage,
    limitations: ['Apenas ESPN está realmente integrado; os demais são skeletons honestos (configured=false sem env).'],
  }
}
