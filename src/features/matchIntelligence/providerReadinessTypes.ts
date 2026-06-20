/**
 * Provider Integration Readiness — frontend types (B41).
 */
export interface ProviderIntegrationReadinessDto {
  providerName: string
  configured: boolean
  enabled: boolean
  hasApiKey: boolean
  hasBaseUrl: boolean
  adapterStatus: 'real' | 'skeleton' | 'not_configured' | 'disabled' | 'unsupported'
  implementedDomains: string[]
  missingDomains: string[]
  blockedDomains: string[]
  missingEnvVars: string[]
  nextSteps: string[]
  safetyWarnings: string[]
}

export interface ProviderReadinessReportDto {
  generatedAt: string
  providers: ProviderIntegrationReadinessDto[]
  limitations: string[]
}

export interface MergeDomainDto {
  domain: string
  chosenSource: 'provider' | 'manual' | 'none'
  chosenSourceLabel: string
  chosenReliability: string
  providerAvailability: string | null
  manualCount: number
  conflict: boolean
  requiresOperatorReview: boolean
  limitations: string[]
}

export interface MergeReportDto {
  fixtureId: string
  domains: MergeDomainDto[]
  conflicts: Array<{ domain: string; detail: string }>
  trustedSources: string[]
  weakSources: string[]
  requiresReview: boolean
  limitations: string[]
  generatedAt: string
}

export interface ReadinessV3Dto {
  status: 'ready_with_provider_data' | 'ready_with_manual_data' | 'partially_ready' | 'wait_for_lineup' | 'wait_for_manual_review' | 'provider_limited' | 'stay_out'
  score: number
  providerDataCoverage: number
  manualDataCoverage: number
  conflictPenalty: number
  lineupSourceReliability: string
  injurySourceReliability: string
  suspensionSourceReliability: string
  criticalDomainBlockers: string[]
  manualReviewRequired: boolean
  waitReasons: string[]
  stayOutReasons: string[]
  limitations: string[]
}

export interface PrecheckV3Dto {
  fixtureId: string
  mode: 'observe' | 'enforce'
  enabled: boolean
  enforced: boolean
  decision: 'avoid' | 'wait_for_lineup' | 'wait_for_manual_review' | 'wait_for_live_confirmation' | 'monitor' | 'alert_candidate' | 'strong_alert' | 'post_match_learning_only'
  reasons: string[]
  positiveFactors: string[]
  negativeFactors: string[]
  uncertaintyFactors: string[]
  stayOutReasons: string[]
  limitations: string[]
}

export const READINESS_V3_LABEL: Record<string, string> = {
  ready_with_provider_data: 'Pronto (provider)',
  ready_with_manual_data: 'Pronto (manual)',
  partially_ready: 'Parcial',
  wait_for_lineup: 'Esperar escalação',
  wait_for_manual_review: 'Revisar conflito',
  provider_limited: 'Limitado por provider',
  stay_out: 'Ficar fora',
}
export const PRECHECK_V3_LABEL: Record<string, string> = {
  avoid: 'Ficar fora', wait_for_lineup: 'Esperar escalação', wait_for_manual_review: 'Revisar conflito',
  wait_for_live_confirmation: 'Esperar ao vivo', monitor: 'Monitorar', alert_candidate: 'Candidato a alerta',
  strong_alert: 'Alerta forte', post_match_learning_only: 'Apenas pós-jogo',
}
