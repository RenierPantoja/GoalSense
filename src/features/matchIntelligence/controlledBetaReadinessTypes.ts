/**
 * Controlled-Beta Readiness DTOs (B50) — frontend mirror. Technical, not a sales guarantee.
 */
export interface ControlledBetaReadinessReportDto {
  status: 'not_ready' | 'internal_alpha' | 'controlled_beta_possible' | 'blocked'
  reasons: string[]
  hardBlockers: string[]
  softBlockers: string[]
  providerRequirements: string[]
  validationRequirements: string[]
  operationalRequirements: string[]
  securityRequirements: string[]
  nextActions: string[]
  limitations: string[]
  generatedAt: string
}

export const CONTROLLED_BETA_LABEL: Record<string, string> = {
  not_ready: 'não pronto', internal_alpha: 'alpha interno', controlled_beta_possible: 'beta controlado possível', blocked: 'bloqueado',
}
