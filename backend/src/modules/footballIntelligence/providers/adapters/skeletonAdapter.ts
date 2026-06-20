/**
 * Honest skeleton adapter base (B40).
 * ─────────────────────────────────────────────────────────────────────────────
 * For providers that COULD cover pre-match domains but are not (yet) wired into the
 * backend. If env/credential is missing → `provider_not_configured` and the provider
 * is NEVER called. If configured but fetch isn't implemented → `unavailable` with an
 * explicit limitation. NEVER fabricates lineups/injuries/suspensions/standings.
 */
import type { AcquisitionDomain, DomainFetchResult, FetchParams, ProviderAdapter, ProviderRegistryEntry } from '../provider.types.js'

export interface SkeletonConfig {
  providerName: string
  priority: number
  requiresApiKey: boolean
  isConfigured: () => boolean
  isEnabled: () => boolean
  domains: AcquisitionDomain[]
  rateLimitProfile: ProviderRegistryEntry['rateLimitProfile']
  costRisk: ProviderRegistryEntry['costRisk']
  caps: Pick<ProviderRegistryEntry, 'supportsTodayFixtures' | 'supportsLineups' | 'supportsInjuries' | 'supportsSuspensions' | 'supportsStandings' | 'supportsH2H' | 'supportsSquads' | 'supportsPostMatch'>
  envDocs: string
}

export class SkeletonProviderAdapter implements ProviderAdapter {
  constructor(private readonly cfg: SkeletonConfig) {}
  get providerName(): string { return this.cfg.providerName }
  isConfigured(): boolean { return this.cfg.isConfigured() }
  isEnabled(): boolean { return this.cfg.isEnabled() }
  supportedDomains(): AcquisitionDomain[] { return this.cfg.domains }

  describe(): ProviderRegistryEntry {
    return {
      providerName: this.cfg.providerName, enabled: this.cfg.isEnabled(), configured: this.cfg.isConfigured(),
      priority: this.cfg.priority, domains: this.cfg.domains, rateLimitProfile: this.cfg.rateLimitProfile,
      costRisk: this.cfg.costRisk, requiresApiKey: this.cfg.requiresApiKey, ...this.cfg.caps,
      limitations: [
        this.cfg.isConfigured()
          ? 'Adapter declarado e configurado, mas a busca real ainda não está implementada no backend (sem fabricação).'
          : `Provider não configurado — ${this.cfg.envDocs}`,
      ],
    }
  }

  async fetchDomain(domain: AcquisitionDomain, _params: FetchParams): Promise<DomainFetchResult> {
    const base: DomainFetchResult = {
      domain, provider: this.cfg.providerName, availability: 'unknown', freshness: 'unknown', dataQuality: 'unavailable',
      fetchedAt: new Date().toISOString(), canonicalData: null, payloadSummary: '', reasons: [], limitations: [],
      providerCandidatesTried: [this.cfg.providerName],
    }
    if (!this.cfg.domains.includes(domain)) {
      return { ...base, availability: 'provider_not_supported', reasons: [`${this.cfg.providerName} não cobre ${domain}.`] }
    }
    if (!this.cfg.isConfigured()) {
      // NEVER call a provider without credentials.
      return { ...base, availability: 'provider_not_configured', reasons: ['Provider sem credencial — não chamado.'], limitations: [this.cfg.envDocs] }
    }
    // Configured but not implemented: honest unavailable, no fabrication.
    return { ...base, availability: 'unavailable', reasons: ['Busca real ainda não implementada no backend.'], limitations: ['Adapter configurado; integração de fetch pendente. Nenhum dado inventado.'] }
  }
}
