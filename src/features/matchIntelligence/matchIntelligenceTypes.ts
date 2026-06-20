/**
 * Match Intelligence Fabric — frontend types (Backstage).
 * ─────────────────────────────────────────────────────────────────────────────
 * Honest shapes mirroring the backend fabric. Absent ≠ zero; unknown ≠ failed.
 * No odds, no stake, no probability-of-winning.
 */

export type CoverageLevel = 'full' | 'partial' | 'limited' | 'unavailable' | 'unknown' | 'not_used'

export interface DomainCapabilityDto {
  domain: string
  coverage: CoverageLevel
  reliability: 'high' | 'medium' | 'low' | 'unknown'
  freshness: string
  note: string
  reason?: string
}

export interface ProviderCapabilitiesDto {
  provider: string
  generatedAt: string
  domains: Record<string, DomainCapabilityDto>
  limitations: string[]
}

export interface ScopedFixtureDto {
  fixtureId: string
  homeTeam: string
  awayTeam: string
  competition: string
  status: string
  kickoffAt: string | null
  isLive: boolean
  isFinished: boolean
  priorityScore: number
  importanceLabel: string
  includedReasons: string[]
  skippedReasons: string[]
  dataSufficiency: 'live_data' | 'pending_kickoff' | 'finished' | 'unknown'
}

export interface MatchDayScopeDto {
  date: string
  totalFixturesKnown: number
  scopedFixtures: ScopedFixtureDto[]
  cap: number
  cappedOut: number
  limitations: string[]
  generatedAt: string
}

export type ReadinessStatus =
  | 'ready' | 'partially_ready' | 'wait_for_lineup' | 'wait_for_live_data'
  | 'not_ready' | 'provider_limited' | 'insufficient_history'

export interface ReadinessDto {
  status: ReadinessStatus
  score: number
  missingCriticalData: string[]
  missingOptionalData: string[]
  waitReasons: string[]
  canAnalyzePreMatch: boolean
  canAnalyzeLive: boolean
  canAnalyzePostMatch: boolean
  limitations: string[]
}

export interface DecisionInputDto {
  id: string
  fixtureId: string
  source: string
  variableKey: string
  variableName: string
  value: string
  direction: 'positive' | 'negative' | 'neutral' | 'uncertain' | 'blocking' | 'contextual'
  weightHint: 'low' | 'medium' | 'high' | 'critical' | 'unknown'
  dataQuality: string
  reasoning: string
  limitations: string[]
  createdAt: string
}

export interface DecisionInputBundleDto {
  positive: DecisionInputDto[]
  negative: DecisionInputDto[]
  neutral: DecisionInputDto[]
  uncertain: DecisionInputDto[]
  blocking: DecisionInputDto[]
  contextual: DecisionInputDto[]
  all: DecisionInputDto[]
}

export interface AlertPrecheckDto {
  fixtureId: string
  mode: 'observe' | 'enforce'
  enabled: boolean
  decision: 'allow_alert' | 'block_alert' | 'wait_for_lineup' | 'wait_for_live_confirmation' | 'downgrade_to_monitor' | 'post_match_only'
  enforced: boolean
  gates: Array<{ gate: string; passed: boolean; detail: string }>
  reasons: string[]
  limitations: string[]
  generatedAt: string
}

export interface PostMatchExplanationDto {
  fixtureId: string
  alertId: string | null
  outcome: string
  keyReasonsItWorked: string[]
  keyReasonsItFailed: string[]
  invalidatedAssumptions: string[]
  unexpectedEvents: string[]
  dataQualityIssues: string[]
  refinementCandidates: string[]
  wasMostlyRandom: boolean
  wasAnalysisWeak: boolean
  wasProviderLimited: boolean
  shouldHaveStayedOut: boolean
  shouldHaveWaited: boolean
  learningNotes: string[]
  limitations: string[]
}

export interface MatchIntelligencePackageDto {
  fixtureId: string
  generatedAt: string
  phase: 'pre_match' | 'lineup_window' | 'live' | 'half_time' | 'post_match'
  fixture: { fixtureId: string; homeTeam: string; awayTeam: string; competition: string; status: string; minute: number | null; scoreHome: number | null; scoreAway: number | null; kickoffAt: string | null }
  readiness: ReadinessDto | null
  context: {
    importanceLevel: string
    pressureLevel: string
    rivalryLevel: string
    volatilityRisk: string
    competitionContext: { stage: string; isKnockout: boolean | 'unknown'; isFinal: boolean | 'unknown' }
    homeAdvantageNote: string
    limitations: string[]
  } | null
  teams: { home: TeamMemoryDto | null; away: TeamMemoryDto | null }
  h2h: { matchesFound: number; relevantMatches: number; outdatedMatches: number; h2hReliability: string; warnings: string[]; limitations: string[] } | null
  squads: SquadAvailabilityDto | null
  tactical: { expectedTempo: string; expectedAggressiveness: string; cardRisk: string; goalEnvironment: string; basis: string; limitations: string[] } | null
  live: { minute: number | null; score: { home: number; away: number } | null; status: string; dataQuality: string; hasStats: boolean; recentEvents: Array<{ minute: number; type: string; side: string }> } | null
  postMatch: { finalScore: { home: number; away: number } | null; totalGoals: number | null; events: Array<{ minute: number; type: string; side: string }> } | null
  decisionInputs: DecisionInputBundleDto
  positiveFactors: string[]
  negativeFactors: string[]
  uncertaintyFactors: string[]
  stayOutReasons: string[]
  waitReasons: string[]
  limitations: string[]
}

export interface TeamMemoryDto {
  teamName: string
  sampleSize: number
  sampleQuality: 'insufficient' | 'low' | 'moderate' | 'strong'
  fixturesAnalyzed: number
  patternsConfirmed: number
  patternsConfirmedPartial: number
  patternsFailed: number
  unknownOutcomes: number
  notEvaluable: number
  commonSuccessReasons: string[]
  commonFailureReasons: string[]
  limitations: string[]
}

export interface SquadAvailabilityDto {
  fixtureId: string
  lineupStatus: 'unavailable' | 'probable' | 'confirmed' | 'partial' | 'not_available_yet'
  minutesToKickoff: number | null
  waitForLineupRecommended: boolean
  injuryImpact: string
  suspensionImpact: string
  analysisImpact: string
  limitations: string[]
}

export const PRECHECK_LABEL: Record<string, string> = {
  allow_alert: 'Liberar alerta',
  block_alert: 'Bloquear (dado crítico ausente)',
  wait_for_lineup: 'Esperar escalação',
  wait_for_live_confirmation: 'Esperar confirmação ao vivo',
  downgrade_to_monitor: 'Rebaixar para monitorar',
  post_match_only: 'Apenas pós-jogo',
}

export const READINESS_LABEL: Record<string, string> = {
  ready: 'Pronto',
  partially_ready: 'Parcialmente pronto',
  wait_for_lineup: 'Esperar escalação',
  wait_for_live_data: 'Esperar dados ao vivo',
  not_ready: 'Não pronto',
  provider_limited: 'Limitado por provider',
  insufficient_history: 'Histórico insuficiente',
}
