/**
 * Provider Integration Readiness (B41).
 * ─────────────────────────────────────────────────────────────────────────────
 * Explains, per provider, exactly why pre-match data is or isn't arriving:
 * configured/enabled, key/base presence, adapter status (real/skeleton/...),
 * implemented vs missing vs blocked domains, missing env vars, next steps. No
 * secrets are exposed (only presence booleans).
 */
import { env } from '../../env.js'
import { listRegisteredProviders } from './providers/providerRegistry.service.js'
import type { AcquisitionDomain } from './providers/provider.types.js'

export type AdapterStatus = 'real' | 'skeleton' | 'not_configured' | 'disabled' | 'unsupported'

export interface ProviderIntegrationReadinessReport {
  providerName: string
  configured: boolean
  enabled: boolean
  hasApiKey: boolean
  hasBaseUrl: boolean
  adapterStatus: AdapterStatus
  implementedDomains: AcquisitionDomain[]
  missingDomains: AcquisitionDomain[]
  blockedDomains: AcquisitionDomain[]
  missingEnvVars: string[]
  nextSteps: string[]
  safetyWarnings: string[]
}

const flag = (v: unknown) => String(v).toLowerCase() === 'true'

export function buildProviderIntegrationReadiness(): { generatedAt: string; providers: ProviderIntegrationReadinessReport[]; limitations: string[] } {
  const entries = listRegisteredProviders()
  const providers = entries.map<ProviderIntegrationReadinessReport>(e => {
    const name = e.providerName
    let hasApiKey = false, hasBaseUrl = false, adapterStatus: AdapterStatus = 'skeleton'
    const missingEnvVars: string[] = []
    const nextSteps: string[] = []
    const blockedDomains: AcquisitionDomain[] = []
    let implementedDomains: AcquisitionDomain[] = []

    if (name === 'espn') {
      hasApiKey = true; hasBaseUrl = !!env.ESPN_BASE_URL; adapterStatus = 'real'
      implementedDomains = ['today_fixtures', 'fixture_details', 'live_events', 'live_stats', 'post_match_stats']
    } else if (name === 'api_football') {
      hasApiKey = !!env.API_FOOTBALL_KEY; hasBaseUrl = !!env.API_FOOTBALL_BASE_URL
      if (!hasApiKey) missingEnvVars.push('API_FOOTBALL_KEY')
      if (!flag(env.ENABLE_PROVIDER_API_FOOTBALL)) missingEnvVars.push('ENABLE_PROVIDER_API_FOOTBALL=true')
      adapterStatus = !e.enabled ? 'disabled' : (e.configured ? 'real' : 'not_configured')
      implementedDomains = e.configured ? ['today_fixtures'] : []
      blockedDomains.push('fixture_details', 'injuries', 'suspensions', 'standings', 'probable_lineups', 'confirmed_lineups', 'squads', 'head_to_head', 'post_match_stats')
      nextSteps.push('Definir API_FOOTBALL_KEY + ENABLE_PROVIDER_API_FOOTBALL=true habilita today_fixtures.')
      nextSteps.push('Domínios por-fixture exigem mapeamento de id ESPN→API-Football (não implementado, sem chutar). Use intake manual.')
    } else if (name === 'football_data_org') {
      hasApiKey = !!env.FOOTBALL_DATA_KEY; hasBaseUrl = !!env.FOOTBALL_DATA_BASE_URL
      if (!hasApiKey) missingEnvVars.push('FOOTBALL_DATA_KEY')
      if (!flag(env.ENABLE_PROVIDER_FOOTBALL_DATA)) missingEnvVars.push('ENABLE_PROVIDER_FOOTBALL_DATA=true')
      adapterStatus = e.configured && e.enabled ? 'skeleton' : 'not_configured'
      nextSteps.push('Skeleton honesto; fetch real ainda não implementado (sem lesões/escalações no provider).')
    } else if (name === 'sportmonks') {
      hasApiKey = !!env.SPORTMONKS_API_KEY; hasBaseUrl = false
      if (!hasApiKey) missingEnvVars.push('SPORTMONKS_API_KEY')
      adapterStatus = 'not_configured'
      nextSteps.push('Sem env/credencial/código no projeto — skeleton.')
    } else if (name === 'manual') {
      hasApiKey = true; hasBaseUrl = true
      adapterStatus = e.configured ? 'real' : 'disabled'
      implementedDomains = ['squads', 'injuries', 'suspensions', 'probable_lineups', 'confirmed_lineups', 'standings', 'head_to_head', 'competition_context']
      if (!flag(env.ENABLE_PROVIDER_MANUAL_LOCAL)) { missingEnvVars.push('ENABLE_PROVIDER_MANUAL_LOCAL=true'); nextSteps.push('Habilite o intake manual para usar dados inseridos pelo operador.') }
    }

    const missingDomains = e.domains.filter(d => !implementedDomains.includes(d) && !blockedDomains.includes(d))
    const safetyWarnings: string[] = []
    if (e.requiresApiKey && !hasApiKey) safetyWarnings.push('Sem credencial — provider não será chamado.')
    return { providerName: name, configured: e.configured, enabled: e.enabled, hasApiKey, hasBaseUrl, adapterStatus, implementedDomains, missingDomains, blockedDomains, missingEnvVars, nextSteps, safetyWarnings }
  })

  return {
    generatedAt: new Date().toISOString(),
    providers,
    limitations: [
      'Apenas ESPN (today/live) e API-Football (today_fixtures por data) têm fetch real; o resto é skeleton ou bloqueado por mapeamento de id.',
      'Dados pré-jogo por fixture (escalação/lesão/suspensão) vêm do intake manual até haver provider/mapeamento.',
    ],
  }
}
