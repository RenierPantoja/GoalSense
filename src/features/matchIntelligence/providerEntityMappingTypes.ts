/**
 * Provider Entity Mapping — frontend types (B43).
 */
export interface ProviderTeamMappingDto {
  id: string
  canonicalTeamName: string
  secondaryProvider: string
  secondaryProviderTeamId: string | null
  secondaryProviderTeamName: string | null
  country: string | null
  status: 'candidate' | 'auto_confirmed' | 'manually_confirmed' | 'ambiguous' | 'rejected' | 'invalidated'
  confidenceScore: number
  confidenceBand: string
  strength: string
  matchedFixtures: string[]
  conflictingFixtures: string[]
  limitations: string[]
}

export interface ProviderCompetitionMappingDto {
  id: string
  canonicalCompetitionName: string
  secondaryProvider: string
  secondaryProviderCompetitionId: string | null
  secondaryProviderCompetitionName: string | null
  country: string | null
  season: string | null
  status: 'candidate' | 'auto_confirmed' | 'manually_confirmed' | 'ambiguous' | 'rejected' | 'invalidated'
  confidenceScore: number
  confidenceBand: string
  matchedFixtures: string[]
  limitations: string[]
}

export interface DomainUnlockStatusDto {
  domain: string
  fixtureId: string
  provider: string
  requiredMappings: string[]
  currentStatus: 'unlocked' | 'blocked_missing_mapping' | 'blocked_ambiguous_mapping' | 'blocked_provider_not_configured' | 'blocked_provider_not_supported' | 'blocked_endpoint_not_implemented' | 'blocked_operator_review'
  reasons: string[]
  suggestedActions: string[]
}

export interface AcquisitionReportV3Dto {
  fixtureId: string
  domainUnlockStatuses: DomainUnlockStatusDto[]
  domainsUnlocked: string[]
  domainsStillBlocked: string[]
  missingMappings: string[]
  ambiguousMappings: string[]
  manualIntakeRecommended: string[]
  limitations: string[]
}

export interface EntityDerivationRunDto {
  id: string
  secondaryProvider: string
  confirmedFixtureMappingsScanned: number
  teamAutoConfirmed: number
  teamAmbiguous: number
  teamCandidates: number
  competitionAutoConfirmed: number
  competitionAmbiguous: number
  competitionCandidates: number
  status: string
  limitations: string[]
}

export const ENTITY_STATUS_LABEL: Record<string, string> = {
  candidate: 'Candidato', auto_confirmed: 'Auto-confirmado', manually_confirmed: 'Confirmado (manual)',
  ambiguous: 'Ambíguo', rejected: 'Rejeitado', invalidated: 'Invalidado',
}
export const UNLOCK_STATUS_LABEL: Record<string, string> = {
  unlocked: 'Desbloqueado', blocked_missing_mapping: 'Falta mapping', blocked_ambiguous_mapping: 'Mapping ambíguo',
  blocked_provider_not_configured: 'Provider não configurado', blocked_provider_not_supported: 'Provider não suporta',
  blocked_endpoint_not_implemented: 'Endpoint não implementado', blocked_operator_review: 'Requer revisão',
}
