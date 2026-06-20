/**
 * Cross-Provider Identity — frontend types (B42).
 */
export interface FixtureIdentityCandidateDto {
  primaryFixtureId: string
  secondaryProvider: string
  secondaryProviderFixtureId: string
  primaryLabel: string
  secondaryLabel: string
  normalizedCompetition: string
  kickoffDeltaMinutes: number | null
  sameDate: boolean
  sameHomeAway: boolean
  swappedHomeAway: boolean
  competitionMatch: boolean
  score: number
  confidenceBand: 'high' | 'medium' | 'low' | 'unknown'
  reasons: string[]
  warnings: string[]
  limitations: string[]
}

export interface ProviderEntityMappingDto {
  id: string
  identityType: string
  primaryProvider: string
  primaryProviderEntityId: string
  secondaryProvider: string
  secondaryProviderEntityId: string | null
  status: 'candidate' | 'auto_confirmed' | 'manually_confirmed' | 'rejected' | 'ambiguous' | 'expired' | 'invalidated' | 'unknown'
  strength: string
  confidenceScore: number
  confidenceBand: 'high' | 'medium' | 'low' | 'unknown'
  matchedFields: string[]
  conflictingFields: string[]
  limitations: string[]
  confirmedBy: string | null
}

export interface FixtureIdentityResolutionRunDto {
  id: string
  date: string
  primaryProvider: string
  secondaryProvider: string
  startedAt: string
  completedAt: string | null
  primaryFixtures: number
  secondaryFixtures: number
  candidatesGenerated: number
  autoConfirmed: number
  ambiguous: number
  status: string
  limitations: string[]
}

export interface TeamAliasDto { id: string; provider: string; rawName: string; normalizedName: string; aliases: string[]; confidence: string; source: string }
export interface CompetitionAliasDto { id: string; provider: string; rawName: string; normalizedName: string; aliases: string[]; confidence: string; source: string }

export const MAPPING_STATUS_LABEL: Record<string, string> = {
  candidate: 'Candidato', auto_confirmed: 'Auto-confirmado', manually_confirmed: 'Confirmado (manual)',
  rejected: 'Rejeitado', ambiguous: 'Ambíguo', expired: 'Expirado', invalidated: 'Invalidado', unknown: 'Desconhecido',
}
