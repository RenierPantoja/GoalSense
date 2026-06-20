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

// ─── B43: entity identity (team / competition / season) ───────────────────────

export type EntityMappingStatus = 'candidate' | 'auto_confirmed' | 'manually_confirmed' | 'ambiguous' | 'rejected' | 'invalidated'
export type EntityMappingStrength = 'fixture_derived' | 'alias_derived' | 'manual_confirmed' | 'provider_exact' | 'weak_name_match' | 'unknown'

export interface ProviderTeamMapping {
  id: string
  canonicalTeamId: string
  canonicalTeamName: string
  primaryProvider: string
  primaryProviderTeamId: string | null
  secondaryProvider: string
  secondaryProviderTeamId: string | null
  secondaryProviderTeamName: string | null
  country: string | null
  competitionHints: string[]
  status: EntityMappingStatus
  confidenceScore: number
  confidenceBand: ConfidenceBand
  strength: EntityMappingStrength
  matchedFixtures: string[]
  conflictingFixtures: string[]
  matchedFields: string[]
  conflictingFields: string[]
  limitations: string[]
  audit: MappingAuditEntry[]
  createdAt: string
  updatedAt: string
  confirmedAt: string | null
  confirmedBy: string | null
}

export interface ProviderCompetitionMapping {
  id: string
  canonicalCompetitionId: string
  canonicalCompetitionName: string
  primaryProvider: string
  primaryProviderCompetitionId: string | null
  secondaryProvider: string
  secondaryProviderCompetitionId: string | null
  secondaryProviderCompetitionName: string | null
  country: string | null
  season: string | null
  type: string | null
  status: EntityMappingStatus
  confidenceScore: number
  confidenceBand: ConfidenceBand
  strength: EntityMappingStrength
  matchedFixtures: string[]
  conflictingFixtures: string[]
  limitations: string[]
  audit: MappingAuditEntry[]
  createdAt: string
  updatedAt: string
  confirmedAt: string | null
  confirmedBy: string | null
}

export interface ProviderSeasonMapping {
  id: string
  primaryProvider: string
  secondaryProvider: string
  canonicalCompetitionId: string
  secondaryProviderLeagueId: string | null
  season: string | null
  status: EntityMappingStatus
  limitations: string[]
}

export type DomainUnlockState =
  | 'unlocked' | 'blocked_missing_mapping' | 'blocked_ambiguous_mapping'
  | 'blocked_provider_not_configured' | 'blocked_provider_not_supported'
  | 'blocked_endpoint_not_implemented' | 'blocked_operator_review'

export interface DomainUnlockStatus {
  domain: string
  fixtureId: string
  provider: string
  requiredMappings: Array<'fixture' | 'home_team' | 'away_team' | 'league' | 'season' | 'country'>
  currentStatus: DomainUnlockState
  reasons: string[]
  suggestedActions: Array<'run_identity_resolution' | 'run_entity_mapping_derivation' | 'confirm_mapping' | 'configure_provider' | 'use_manual_intake' | 'none'>
  // ── B44: Domain Unlock Matrix V2 ──
  endpointStatus?: string
  endpointKey?: string | null
  endpointImplemented?: boolean
  endpointDocumented?: boolean
  idsResolved?: { fixtureId?: string | null; homeTeamId?: string | null; awayTeamId?: string | null; leagueId?: string | null; season?: string | null }
  idsMissing?: string[]
  manualFallbackAvailable?: boolean
  recommendedNextAction?: 'configure_provider' | 'run_fixture_mapping' | 'run_entity_mapping' | 'confirm_mapping' | 'use_manual_intake' | 'provide_endpoint_docs' | 'ready_to_fetch' | 'stay_out'
}

export interface EntityMappingDerivationRun {
  id: string
  startedAt: string
  completedAt: string | null
  secondaryProvider: string
  confirmedFixtureMappingsScanned: number
  teamCandidates: number
  teamAutoConfirmed: number
  teamAmbiguous: number
  competitionCandidates: number
  competitionAutoConfirmed: number
  competitionAmbiguous: number
  errors: string[]
  status: 'completed' | 'completed_with_limitations' | 'provider_not_configured' | 'failed_non_fatal' | 'disabled'
  limitations: string[]
}
