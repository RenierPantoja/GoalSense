/**
 * Critical Pre-Match Domains — frontend types (B44).
 */
export interface ProviderEndpointCatalogEntryDto {
  provider: string
  domain: string
  endpointKey: string
  implemented: boolean
  documented: boolean
  requiredIds: string[]
  safetyStatus: string
  limitations: string[]
  docsReference: string
}

export interface DomainUnlockMatrixEntryDto {
  domain: string
  fixtureId: string
  provider: string
  currentStatus: string
  endpointStatus?: string
  endpointKey?: string | null
  idsResolved?: Record<string, string | null>
  idsMissing?: string[]
  manualFallbackAvailable?: boolean
  recommendedNextAction?: string
  reasons: string[]
}

export interface CriticalDomainAcquisitionReportDto {
  fixtureId: string
  results: Array<{ domain: string; attempted: boolean; availability: string; endpointStatus: string | null; recommendedNextAction?: string; manualFallbackAvailable: boolean; confirmedEmpty: boolean }>
  domainsFetched: string[]
  domainsBlocked: string[]
  domainsManualRecommended: string[]
  domainsProviderNotConfigured: string[]
  domainsEndpointMissingDocs: string[]
  domainsWithConfirmedEmpty: string[]
  criticalDomainsReady: string[]
  criticalDomainsMissing: string[]
  nextRefreshRecommendations: string[]
  limitations: string[]
}

export interface ReadinessV5Dto {
  status: string
  criticalDomainReadiness: number
  domainReliabilityScore: number
  fetchedCriticalDomains: string[]
  blockedCriticalDomains: string[]
  staleCriticalDomains: string[]
  manualCriticalDomains: string[]
  endpointMissingDocsDomains: string[]
  providerNotConfiguredDomains: string[]
  limitations: string[]
}

export interface PrecheckV5Dto {
  fixtureId: string
  mode: 'observe' | 'enforce'
  enabled: boolean
  enforced: boolean
  decision: string
  reasons: string[]
  limitations: string[]
}

export const DOMAIN_STATUS_LABEL: Record<string, string> = {
  safe_to_call: 'Pronto', unlocked: 'Desbloqueado', available: 'Buscado', available_empty_confirmed: 'Vazio confirmado',
  partial: 'Parcial', blocked_missing_env: 'Provider não configurado', blocked_provider_not_configured: 'Provider não configurado',
  blocked_missing_mapping: 'Falta mapping', blocked_ambiguous_mapping: 'Mapping ambíguo',
  blocked_not_documented: 'Endpoint não documentado', not_implemented: 'Não implementado',
  blocked_endpoint_not_implemented: 'Endpoint não implementado', provider_not_supported: 'Provider não suporta',
}
export const NEXT_ACTION_LABEL: Record<string, string> = {
  configure_provider: 'Configurar provider', run_fixture_mapping: 'Resolver fixture', run_entity_mapping: 'Derivar entidade',
  confirm_mapping: 'Confirmar mapping', use_manual_intake: 'Usar manual', provide_endpoint_docs: 'Endpoint não documentado',
  ready_to_fetch: 'Pronto p/ buscar', stay_out: 'Ficar fora', none: '—',
}
