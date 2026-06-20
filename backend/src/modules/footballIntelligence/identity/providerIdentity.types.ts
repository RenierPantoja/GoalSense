/**
 * Cross-Provider Identity — contracts (B42).
 * ─────────────────────────────────────────────────────────────────────────────
 * Safe mapping of fixtures/teams/competitions between ESPN and external providers.
 * Never guesses ids; name-only never reaches high confidence; ambiguous never
 * auto-confirms. `inferred` never pretends to be `manually_confirmed`.
 */

export type ProviderEntityType = 'fixture' | 'team' | 'competition' | 'player' | 'season' | 'venue' | 'referee'

export type ProviderEntityMappingStatus =
  | 'candidate' | 'auto_confirmed' | 'manually_confirmed' | 'rejected' | 'ambiguous' | 'expired' | 'invalidated' | 'unknown'

export type ProviderEntityMappingStrength =
  | 'exact_provider_id' | 'strong_composite' | 'medium_composite' | 'weak_name_match' | 'manual_confirmed' | 'unknown'

export type ConfidenceBand = 'high' | 'medium' | 'low' | 'unknown'

export interface MappingAuditEntry {
  at: string
  by: string | null
  action: 'created' | 'auto_confirmed' | 'manually_confirmed' | 'rejected' | 'invalidated' | 'expired'
  note?: string
}

export interface ProviderEntityMapping {
  id: string
  identityType: ProviderEntityType
  canonicalEntityId: string
  primaryProvider: string
  primaryProviderEntityId: string
  secondaryProvider: string
  secondaryProviderEntityId: string | null
  status: ProviderEntityMappingStatus
  strength: ProviderEntityMappingStrength
  confidenceScore: number
  confidenceBand: ConfidenceBand
  matchedFields: string[]
  conflictingFields: string[]
  fingerprint: string
  limitations: string[]
  createdAt: string
  updatedAt: string
  confirmedAt: string | null
  confirmedBy: string | null
  rejectedAt: string | null
  rejectedBy: string | null
  expiresAt: string | null
  audit: MappingAuditEntry[]
}

export interface FixtureIdentityCandidate {
  primaryFixtureId: string
  secondaryProvider: string
  secondaryProviderFixtureId: string
  primaryLabel: string
  secondaryLabel: string
  normalizedHome: string
  normalizedAway: string
  normalizedCompetition: string
  kickoffDeltaMinutes: number | null
  sameDate: boolean
  sameHomeAway: boolean
  swappedHomeAway: boolean
  competitionMatch: boolean
  countryMatch: boolean | 'unknown'
  seasonMatch: boolean | 'unknown'
  score: number
  confidenceBand: ConfidenceBand
  reasons: string[]
  warnings: string[]
  limitations: string[]
}

export interface TeamAlias {
  id: string
  canonicalTeamId: string | null
  provider: string
  providerTeamId: string | null
  rawName: string
  normalizedName: string
  aliases: string[]
  country: string | null
  competitionHints: string[]
  confidence: ConfidenceBand
  source: 'auto' | 'manual' | 'derived_from_mapping'
  createdAt: string
}

export interface CompetitionAlias {
  id: string
  canonicalCompetitionId: string | null
  provider: string
  providerCompetitionId: string | null
  rawName: string
  normalizedName: string
  aliases: string[]
  country: string | null
  season: string | null
  confidence: ConfidenceBand
  source: 'auto' | 'manual' | 'derived_from_mapping'
  createdAt: string
}

export interface FixtureIdentityResolutionRun {
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
  rejected: number
  errors: string[]
  status: 'completed' | 'completed_with_limitations' | 'provider_not_configured' | 'failed_non_fatal' | 'disabled'
  limitations: string[]
}
