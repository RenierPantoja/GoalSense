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

// ─── B40: pre-match acquisition + lineup window + V2 ───────────────────────────

export interface ProviderRegistryEntryDto {
  providerName: string
  enabled: boolean
  configured: boolean
  priority: number
  domains: string[]
  requiresApiKey: boolean
  costRisk: string
  supportsLineups: boolean
  supportsInjuries: boolean
  supportsSuspensions: boolean
  supportsStandings: boolean
  limitations: string[]
}

export interface ProviderStackReportDto {
  generatedAt: string
  registered: ProviderRegistryEntryDto[]
  configured: string[]
  unconfigured: string[]
  domainCoverage: Record<string, { providers: string[]; bestProvider: string | null; supported: boolean }>
  limitations: string[]
}

export interface AcquisitionRunDto {
  id: string
  scope: 'today' | 'fixture'
  fixtureId: string | null
  startedAt: string
  completedAt: string | null
  mode: 'manual' | 'scheduled'
  tasksPlanned: number
  tasksRan: number
  tasksSkipped: number
  domainsAvailable: number
  domainsUnavailable: number
  domainsUnsupported: number
  providerCallsBlocked: number
  status: string
  limitations: string[]
}

export interface LineupWindowDto {
  fixtureId: string
  status: 'too_early' | 'probable_expected' | 'confirmed_expected_soon' | 'confirmed_available' | 'confirmed_unavailable' | 'provider_not_supported' | 'stale' | 'unknown'
  minutesToKickoff: number | null
  lineupSnapshotAt: string | null
  shouldWait: boolean
  shouldRefreshNow: boolean
  nextRecommendedCheckAt: string | null
  limitations: string[]
}

export interface PlayerImportanceFixtureDto {
  fixtureId: string
  home: Array<{ playerName: string; position: string | null; importanceLevel: string; evidence: string[] }>
  away: Array<{ playerName: string; position: string | null; importanceLevel: string; evidence: string[] }>
  limitations: string[]
}

export interface ReadinessV2Dto {
  status: 'ready_for_pre_match_analysis' | 'wait_for_lineup' | 'wait_for_injury_suspension_update' | 'wait_for_live_confirmation' | 'provider_limited' | 'insufficient_context' | 'stay_out'
  score: number
  providerCoverageScore: number
  lineupReadiness: string
  injurySuspensionReadiness: string
  contextReadiness: string
  memoryReadiness: string
  criticalMissingDomains: string[]
  stayOutReasons: string[]
  waitReasons: string[]
  limitations: string[]
}

export interface PrecheckV2Dto {
  fixtureId: string
  mode: 'observe' | 'enforce'
  enabled: boolean
  enforced: boolean
  decision: 'avoid' | 'wait_for_lineup' | 'wait_for_injury_suspension_update' | 'wait_for_live_confirmation' | 'monitor' | 'alert_candidate' | 'strong_alert' | 'post_match_learning_only'
  reasons: string[]
  positiveFactors: string[]
  negativeFactors: string[]
  uncertaintyFactors: string[]
  stayOutReasons: string[]
  limitations: string[]
}

export interface PostMatchV2Dto extends PostMatchExplanationDto {
  causeCategory: string
  redCardChangedGame: boolean
  providerWasLimited: boolean
  shouldHaveWaitedLineup: boolean
  shouldHaveWaitedLiveConfirmation: boolean
  classicOrKnockoutVolatility: boolean | 'unknown'
}

export interface MatchIntelligencePackageV2Dto {
  base: MatchIntelligencePackageDto
  acquisitionStatus: { lastRunAt: string | null; runs: number }
  domainSnapshots: Array<{ domain: string; provider: string | null; availability: string; freshness: string; fetchedAt: string; stale: boolean }>
  lineupWindow: LineupWindowDto | null
  playerImportance: { home: PlayerImportanceFixtureDto['home']; away: PlayerImportanceFixtureDto['away'] }
  readinessV2: ReadinessV2Dto | null
  precheckV2: PrecheckV2Dto | null
  missingCriticalDomains: string[]
  lastRefreshAt: string | null
  nextRecommendedRefreshAt: string | null
  providerReliability: { configured: string[]; unconfigured: string[] }
  shouldRefreshNow: boolean
  limitations: string[]
}

export const PRECHECK_V2_LABEL: Record<string, string> = {
  avoid: 'Ficar fora',
  wait_for_lineup: 'Esperar escalação',
  wait_for_injury_suspension_update: 'Esperar lesões/suspensões',
  wait_for_live_confirmation: 'Esperar confirmação ao vivo',
  monitor: 'Monitorar',
  alert_candidate: 'Candidato a alerta',
  strong_alert: 'Alerta forte',
  post_match_learning_only: 'Apenas pós-jogo',
}

export const READINESS_V2_LABEL: Record<string, string> = {
  ready_for_pre_match_analysis: 'Pronto p/ análise pré-jogo',
  wait_for_lineup: 'Esperar escalação',
  wait_for_injury_suspension_update: 'Esperar lesões/suspensões',
  wait_for_live_confirmation: 'Esperar confirmação ao vivo',
  provider_limited: 'Limitado por provider',
  insufficient_context: 'Contexto insuficiente',
  stay_out: 'Ficar fora',
}
