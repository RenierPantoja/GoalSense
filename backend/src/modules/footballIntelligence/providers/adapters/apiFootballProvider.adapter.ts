/**
 * API-Football adapter (B41) — real, env-gated, documented endpoints only.
 * ─────────────────────────────────────────────────────────────────────────────
 * Without API_FOOTBALL_KEY + ENABLE_PROVIDER_API_FOOTBALL it is provider_not_configured
 * and NEVER called. When configured it performs ONE safe, ID-free, documented call:
 * today fixtures by date (`/fixtures?date=`) — the same base/endpoint the repo's edge
 * functions already use. Fixture-scoped domains (injuries/lineups/standings/H2H) are
 * BLOCKED by the missing ESPN→API-Football id mapping and return `unavailable` with an
 * explicit limitation — never guessed, never fabricated. No token is ever logged.
 */
import { env } from '../../../../env.js'
import type { AcquisitionDomain, DomainFetchResult, FetchParams, ProviderAdapter, ProviderRegistryEntry } from '../provider.types.js'

const flag = (v: unknown) => String(v).toLowerCase() === 'true'
const DOMAINS: AcquisitionDomain[] = ['today_fixtures', 'fixture_details', 'standings', 'team_form', 'head_to_head', 'squads', 'injuries', 'suspensions', 'probable_lineups', 'confirmed_lineups', 'post_match_stats', 'competition_context']
// Domains that need an API-Football fixture/team id we do not have (ESPN-sourced fixtures).
const ID_MAPPING_BLOCKED: AcquisitionDomain[] = ['fixture_details', 'standings', 'team_form', 'head_to_head', 'squads', 'injuries', 'suspensions', 'probable_lineups', 'confirmed_lineups', 'post_match_stats', 'competition_context']

function isConfigured(): boolean { return !!env.API_FOOTBALL_KEY && env.API_FOOTBALL_KEY.length > 0 && flag(env.ENABLE_PROVIDER_API_FOOTBALL) }

function base(domain: AcquisitionDomain): DomainFetchResult {
  return {
    domain, provider: 'api_football', availability: 'unknown', freshness: 'unknown', dataQuality: 'unavailable',
    fetchedAt: new Date().toISOString(), canonicalData: null, payloadSummary: '', reasons: [], limitations: [], providerCandidatesTried: ['api_football'],
  }
}

export class ApiFootballProviderAdapter implements ProviderAdapter {
  providerName = 'api_football'
  isConfigured(): boolean { return isConfigured() }
  isEnabled(): boolean { return flag(env.ENABLE_PROVIDER_API_FOOTBALL) }
  supportedDomains(): AcquisitionDomain[] { return DOMAINS }

  describe(): ProviderRegistryEntry {
    const configured = isConfigured()
    return {
      providerName: 'api_football', enabled: this.isEnabled(), configured, priority: 20, domains: DOMAINS,
      rateLimitProfile: 'tight', costRisk: 'medium', requiresApiKey: true,
      supportsTodayFixtures: true, supportsLineups: true, supportsInjuries: true, supportsSuspensions: true,
      supportsStandings: true, supportsH2H: true, supportsSquads: true, supportsPostMatch: true,
      limitations: configured
        ? ['Configurado. Apenas today_fixtures (por data) é buscado de verdade; domínios por-fixture estão bloqueados por falta de mapeamento de id ESPN→API-Football.']
        : ['Defina API_FOOTBALL_KEY e ENABLE_PROVIDER_API_FOOTBALL=true para habilitar.'],
    }
  }

  async fetchDomain(domain: AcquisitionDomain, params: FetchParams): Promise<DomainFetchResult> {
    const r = base(domain)
    if (!DOMAINS.includes(domain)) return { ...r, availability: 'provider_not_supported', reasons: [`api_football não cobre ${domain}.`] }
    if (!this.isConfigured()) return { ...r, availability: 'provider_not_configured', reasons: ['Sem API_FOOTBALL_KEY/flag — não chamado.'], limitations: ['Defina API_FOOTBALL_KEY e ENABLE_PROVIDER_API_FOOTBALL=true.'] }

    if (ID_MAPPING_BLOCKED.includes(domain)) {
      return { ...r, availability: 'unavailable', reasons: ['Bloqueado: falta mapeamento de id ESPN→API-Football para chamadas por fixture.'], limitations: ['Fixtures são originadas do ESPN; sem id da API-Football não buscamos por fixture (sem chutar). Use intake manual.'] }
    }

    // today_fixtures by date — the only safe, ID-free, documented call.
    try {
      const date = (params.date || new Date().toISOString().slice(0, 10))
      const url = `${env.API_FOOTBALL_BASE_URL}/fixtures?date=${encodeURIComponent(date)}`
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), env.PROVIDER_FETCH_TIMEOUT_MS)
      const res = await fetch(url, { signal: controller.signal, headers: { 'x-apisports-key': env.API_FOOTBALL_KEY as string, 'Accept': 'application/json' } })
      clearTimeout(timeout)
      if (!res.ok) return { ...r, availability: 'unavailable', reasons: [`API-Football respondeu ${res.status}.`] }
      const json: any = await res.json()
      if (json?.errors && Object.keys(json.errors).length > 0) return { ...r, availability: 'unavailable', reasons: ['API-Football retornou erro de plano/credencial.'], limitations: ['Verifique cota/credencial.'] }
      const count = Array.isArray(json?.response) ? json.response.length : 0
      return {
        ...r,
        availability: count > 0 ? 'available' : 'available_empty_confirmed',
        freshness: 'near_realtime', dataQuality: count > 0 ? 'partial' : 'poor',
        canonicalData: { date, count }, payloadSummary: `${count} fixtures na data ${date}`,
        limitations: ['Informativo: não consolidado às fixtures ESPN (sem mapeamento de id).'],
      }
    } catch (e: any) {
      return { ...r, availability: 'unavailable', reasons: [`Falha não-fatal: ${String(e?.message || e).slice(0, 50)}`] }
    }
  }
}

/** Backward-compatible factory used by the registry. */
export function createApiFootballAdapter(): ApiFootballProviderAdapter { return new ApiFootballProviderAdapter() }
