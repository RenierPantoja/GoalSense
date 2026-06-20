/**
 * Manual Local provider adapter (B40) — operator-entered data only, NEVER mock.
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads pre-match domain snapshots that were entered by an operator (provider =
 * 'manual') from the store. It fabricates nothing: with no manual entry it returns
 * not_available_yet. Enabled only when ENABLE_PROVIDER_MANUAL_LOCAL=true.
 */
import { env } from '../../../../env.js'
import { getPreMatchDomainSnapshot } from '../../preMatchDataStore.service.js'
import type { AcquisitionDomain, DomainFetchResult, FetchParams, ProviderAdapter, ProviderRegistryEntry } from '../provider.types.js'

const flag = (v: unknown) => String(v).toLowerCase() === 'true'
const DOMAINS: AcquisitionDomain[] = ['standings', 'team_form', 'head_to_head', 'squads', 'injuries', 'suspensions', 'probable_lineups', 'confirmed_lineups', 'competition_context']

export class ManualLocalProviderAdapter implements ProviderAdapter {
  providerName = 'manual'
  isConfigured(): boolean { return flag(env.ENABLE_PROVIDER_MANUAL_LOCAL) }
  isEnabled(): boolean { return flag(env.ENABLE_PROVIDER_MANUAL_LOCAL) }
  supportedDomains(): AcquisitionDomain[] { return DOMAINS }

  describe(): ProviderRegistryEntry {
    return {
      providerName: 'manual', enabled: this.isEnabled(), configured: this.isConfigured(), priority: 5, domains: DOMAINS,
      rateLimitProfile: 'generous', costRisk: 'none', requiresApiKey: false,
      supportsTodayFixtures: false, supportsLineups: true, supportsInjuries: true, supportsSuspensions: true,
      supportsStandings: true, supportsH2H: true, supportsSquads: true, supportsPostMatch: false,
      limitations: ['Apenas dados inseridos manualmente pelo operador (provider="manual"); nunca mock.'],
    }
  }

  async fetchDomain(domain: AcquisitionDomain, params: FetchParams): Promise<DomainFetchResult> {
    const base: DomainFetchResult = {
      domain, provider: 'manual', availability: 'unknown', freshness: 'unknown', dataQuality: 'unavailable',
      fetchedAt: new Date().toISOString(), canonicalData: null, payloadSummary: '', reasons: [], limitations: [],
      providerCandidatesTried: ['manual'],
    }
    if (!this.isConfigured()) return { ...base, availability: 'provider_not_configured', reasons: ['Manual local desabilitado.'], limitations: ['Defina ENABLE_PROVIDER_MANUAL_LOCAL=true.'] }
    if (!DOMAINS.includes(domain)) return { ...base, availability: 'provider_not_supported', reasons: [`manual não cobre ${domain}.`] }
    if (!params.fixtureId) return { ...base, availability: 'unavailable', reasons: ['fixtureId ausente.'] }
    const existing = await getPreMatchDomainSnapshot(params.fixtureId, domain).catch(() => null)
    if (existing && existing.provider === 'manual') {
      return { ...base, provider: 'manual', availability: existing.availability, freshness: existing.freshness, dataQuality: existing.dataQuality, canonicalData: existing.canonicalData, payloadSummary: existing.payloadSummary, limitations: existing.limitations }
    }
    return { ...base, availability: 'not_available_yet', reasons: ['Sem dado manual inserido para este domínio/fixture.'], limitations: ['Entrada manual ainda não fornecida.'] }
  }
}
