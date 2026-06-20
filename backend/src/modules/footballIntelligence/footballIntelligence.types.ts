/**
 * Canonical Football Intelligence Contracts (Match Intelligence Fabric).
 * ─────────────────────────────────────────────────────────────────────────────
 * Honest, future-ready shapes for deep match analysis. Every object carries
 * provenance + availability + reliability + limitations. Absent ≠ zero; empty list
 * only when the provider confirmed it. `confidenceOfData` is confidence in the DATA,
 * never a probability of winning.
 */

export type DataQuality = 'rich' | 'partial' | 'poor' | 'unavailable' | 'unknown'

export type Availability =
  | 'available' | 'partially_available' | 'unavailable'
  | 'provider_not_supported' | 'not_fetched' | 'not_available_yet' | 'unknown'

export type Reliability = 'high' | 'medium' | 'low' | 'unknown'

/** Provenance envelope every canonical object embeds. */
export interface CanonicalMeta {
  provider: string | null
  providerIds: Record<string, string | number | null>
  fetchedAt: string | null
  dataQuality: DataQuality
  availability: Availability
  reliability: Reliability
  /** Confidence in the DATA itself, NOT a probability of an outcome. */
  confidenceOfData: 'high' | 'medium' | 'low' | 'unknown'
  source: string
  limitations: string[]
}

export function unknownMeta(source: string, availability: Availability = 'not_fetched', extra: string[] = []): CanonicalMeta {
  return {
    provider: null, providerIds: {}, fetchedAt: null,
    dataQuality: 'unknown', availability, reliability: 'unknown', confidenceOfData: 'unknown',
    source, limitations: extra,
  }
}

// ─── Fixture / competition ─────────────────────────────────────────────────────

export interface CanonicalFixture {
  fixtureId: string
  canonicalKey: string | null
  homeTeam: string
  awayTeam: string
  competition: string
  status: string
  minute: number | null
  scoreHome: number | null
  scoreAway: number | null
  kickoffAt: string | null
  meta: CanonicalMeta
}

export type CompetitionType = 'league' | 'cup' | 'continental' | 'national_team' | 'friendly' | 'unknown'

export interface CanonicalCompetition {
  name: string
  competitionType: CompetitionType
  country: string | null
  meta: CanonicalMeta
}

export interface CanonicalCompetitionContext {
  competition: CanonicalCompetition
  stage: string
  isKnockout: boolean | 'unknown'
  isFinal: boolean | 'unknown'
  isSemiFinal: boolean | 'unknown'
  isTwoLegged: boolean | 'unknown'
  legType: 'first_leg' | 'second_leg' | 'single' | 'unknown'
  aggregateScore: { home: number; away: number } | null
  meta: CanonicalMeta
}

export type ImportanceLevel = 'low' | 'medium' | 'high' | 'critical' | 'unknown'

export interface CanonicalMatchImportance {
  importanceLevel: ImportanceLevel
  reasons: string[]
  titleImplication: boolean | 'unknown'
  relegationImplication: boolean | 'unknown'
  continentalImplication: boolean | 'unknown'
  meta: CanonicalMeta
}

// ─── Teams / players ───────────────────────────────────────────────────────────

export interface CanonicalTeam {
  teamId: string | null
  name: string
  side: 'home' | 'away'
  meta: CanonicalMeta
}

export interface CanonicalPlayer {
  playerId: string | null
  name: string
  position: string | null
  importance: 'key' | 'regular' | 'squad' | 'unknown'
  meta: CanonicalMeta
}

export interface CanonicalSquad {
  teamId: string | null
  players: CanonicalPlayer[]
  meta: CanonicalMeta
}

export type LineupStatus = 'unavailable' | 'probable' | 'confirmed' | 'partial' | 'not_available_yet'

export interface CanonicalLineup {
  teamId: string | null
  side: 'home' | 'away'
  status: LineupStatus
  formation: string | null
  starters: CanonicalPlayer[]
  bench: CanonicalPlayer[]
  meta: CanonicalMeta
}

// ─── Availability (injuries / suspensions / cards) ───────────────────────────────

export interface CanonicalInjuryReport {
  teamId: string | null
  side: 'home' | 'away'
  injuries: Array<{ playerName: string; status: string; importance: 'key' | 'regular' | 'squad' | 'unknown' }>
  meta: CanonicalMeta
}

export interface CanonicalSuspensionReport {
  teamId: string | null
  side: 'home' | 'away'
  suspensions: Array<{ playerName: string; reason: string; importance: 'key' | 'regular' | 'squad' | 'unknown' }>
  bookablePlayers: Array<{ playerName: string }>
  meta: CanonicalMeta
}

export interface CanonicalCardRiskProfile {
  side: 'home' | 'away'
  expectedCardRisk: 'low' | 'medium' | 'high' | 'unknown'
  basis: string[]
  meta: CanonicalMeta
}

export interface CanonicalPlayerAvailability {
  side: 'home' | 'away'
  keyAbsences: string[]
  keyReturns: string[]
  meta: CanonicalMeta
}

// ─── Form / H2H / home-away ──────────────────────────────────────────────────────

export interface CanonicalTeamForm {
  teamId: string | null
  side: 'home' | 'away'
  recentResults: Array<'W' | 'D' | 'L'>
  sampleSize: number
  goalsForAvg: number | null
  goalsAgainstAvg: number | null
  meta: CanonicalMeta
}

export interface CanonicalHeadToHead {
  matchesFound: number
  relevantMatches: number
  outdatedMatches: number
  recurringPatterns: string[]
  meta: CanonicalMeta
}

export interface CanonicalHomeAwayProfile {
  side: 'home' | 'away'
  venueStrength: 'strong' | 'average' | 'weak' | 'unknown'
  notes: string[]
  meta: CanonicalMeta
}

// ─── Live / events / stats ───────────────────────────────────────────────────────

export interface CanonicalMatchEvent {
  minute: number
  type: string
  side: 'home' | 'away' | 'unknown'
  playerName: string | null
}

export interface CanonicalSubstitution {
  minute: number
  side: 'home' | 'away' | 'unknown'
  playerName: string | null
}

export interface CanonicalMatchStats {
  possession: { home: number | null; away: number | null }
  shots: { home: number | null; away: number | null }
  shotsOnTarget: { home: number | null; away: number | null }
  corners: { home: number | null; away: number | null }
  cards: { yellowHome: number | null; yellowAway: number | null; redHome: number | null; redAway: number | null }
  meta: CanonicalMeta
}

export interface CanonicalPostMatchSummary {
  finalScore: { home: number; away: number } | null
  totalGoals: number | null
  events: CanonicalMatchEvent[]
  meta: CanonicalMeta
}

export interface CanonicalTacticalContext {
  expectedTempo: 'high' | 'medium' | 'low' | 'unknown'
  expectedAggressiveness: 'high' | 'medium' | 'low' | 'unknown'
  styleConflict: boolean | 'unknown'
  notes: string[]
  meta: CanonicalMeta
}

// ─── Availability & readiness summaries ──────────────────────────────────────────

export interface CanonicalDataAvailability {
  /** Per-domain availability (domain → Availability). */
  byDomain: Record<string, Availability>
  missingCritical: string[]
  missingOptional: string[]
  limitations: string[]
}

export type ReadinessStatus =
  | 'ready' | 'partially_ready' | 'wait_for_lineup' | 'wait_for_live_data'
  | 'not_ready' | 'provider_limited' | 'insufficient_history'

export interface CanonicalAnalysisReadiness {
  status: ReadinessStatus
  /** Readiness score (0-100) — readiness only, NOT a probability of an outcome. */
  score: number
  missingCriticalData: string[]
  missingOptionalData: string[]
  waitReasons: string[]
  canAnalyzePreMatch: boolean
  canAnalyzeLive: boolean
  canAnalyzePostMatch: boolean
  limitations: string[]
}
