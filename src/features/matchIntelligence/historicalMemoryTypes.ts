/**
 * Historical Memory DTOs (B45 / Bloco 2) — frontend mirror of backend memory types.
 * Advisory only: reliability ≠ probability; insufficient_history is honest, not negative.
 */

export type SampleQualityDto = 'strong' | 'usable' | 'weak' | 'insufficient' | 'misleading_risk' | 'unknown'

export interface SampleQualityAssessmentDto {
  quality: SampleQualityDto
  sampleSize: number
  recentSampleSize: number
  outdatedSampleSize: number
  contextMatchedSampleSize: number
  reliability: 'high' | 'medium' | 'low' | 'insufficient'
  canConclude: boolean
  warnings: string[]
  limitations: string[]
}

export interface TeamHomeAwayProfileDto {
  homeSample: number; awaySample: number
  homeConfirmed: number; homeFailed: number; awayConfirmed: number; awayFailed: number
  homeQuality: SampleQualityDto; awayQuality: SampleQualityDto; note: string
}

export interface PatternHistoryProfileDto {
  patternKey: string; patternName: string; triggered: number
  confirmed: number; confirmedPartial: number; failed: number; unknown: number; notEvaluable: number
  quality: SampleQualityDto
  status: 'supported' | 'mixed' | 'weak_sample' | 'not_enough_data' | 'contradicted'
  note: string
}

export interface ContextBehaviorProfileDto {
  contextKey: string; contextLabel: string; sample: number
  confirmed: number; failed: number; unknown: number; quality: SampleQualityDto
  classification: 'strong_context' | 'usable_context' | 'misleading_context' | 'stay_out_context' | 'not_enough_data'
  note: string
}

export interface TeamFundamentalMemoryDto {
  id: string; teamId: string; teamName: string; builtAt: string; recencyWindowDays: number
  overallSample: SampleQualityAssessmentDto
  homeAway: TeamHomeAwayProfileDto
  goals: { observed: boolean; sample: number; tendencyNote: string; quality: SampleQualityDto; limitations: string[] }
  cards: { observed: boolean; sample: number; tendencyNote: string; quality: SampleQualityDto; limitations: string[] }
  patternHistory: PatternHistoryProfileDto[]
  contextBehaviors: ContextBehaviorProfileDto[]
  competitionsObserved: string[]
  memoryState: 'insufficient_history' | 'developing' | 'usable' | 'mature'
  limitations: string[]
  source: string
}

export interface MatchupFundamentalMemoryDto {
  id: string; homeTeamId: string; awayTeamId: string; homeTeamName: string; awayTeamName: string; builtAt: string
  matchesFound: number; relevantMatches: number; outdatedMatches: number
  sample: SampleQualityAssessmentDto
  recurringObservations: string[]; brokenObservations: string[]
  matchupState: 'insufficient_data' | 'developing' | 'usable' | 'mature'
  maturity: 'low' | 'medium' | 'high' | 'insufficient_data'
  limitations: string[]; source: string
}

export interface HistoricalPatternContextProfileDto {
  id: string; patternKey: string; patternName: string; contextKey: string; contextLabel: string; builtAt: string
  sample: SampleQualityAssessmentDto
  confirmed: number; confirmedPartial: number; failed: number; unknown: number; notEvaluable: number
  classification: 'confirmed_strong' | 'confirmed_partial_useful' | 'mixed' | 'failed_context' | 'not_evaluable' | 'not_enough_data'
  recommendation: 'use_with_confidence' | 'use_with_caution' | 'monitor_only' | 'stay_out' | 'insufficient'
  note: string; limitations: string[]; source: string
}

export type TabooStatusDto =
  | 'candidate' | 'supported' | 'weak_sample' | 'outdated' | 'contradicted' | 'superstition_risk' | 'not_enough_data'

export interface TabooCandidateDto {
  id: string; scopeType: 'team' | 'matchup' | 'competition'; scopeKey: string; scopeLabel: string; contextKey: string
  description: string; builtAt: string; sample: SampleQualityAssessmentDto
  supportingCases: number; contradictingCases: number
  status: TabooStatusDto; isUsableConstraint: boolean; note: string; limitations: string[]; source: string
}

export interface SimilarMatchScenarioDto {
  fixtureId: string; matchedOn: string[]; similarityScore: number; similarityQuality: SampleQualityDto
  observedOutcome: 'confirmed' | 'confirmed_partial' | 'failed' | 'unknown' | 'not_evaluable' | 'no_alert'
  contextSummary: string; usefulnessNote: string; limitations: string[]
}

export interface SimilarScenarioResultDto {
  fixtureId: string; scenarios: SimilarMatchScenarioDto[]; totalConsidered: number; usableScenarios: number
  note: string; limitations: string[]; source: string
}

export interface FixtureMemoryDto {
  homeMemory: TeamFundamentalMemoryDto | null
  awayMemory: TeamFundamentalMemoryDto | null
  matchupMemory: MatchupFundamentalMemoryDto | null
  patternContextMemory: HistoricalPatternContextProfileDto[]
  taboos: TabooCandidateDto[]
  similarScenarios: SimilarScenarioResultDto | null
}

export interface MemoryBuildRunDto {
  id: string; scope: string; targetKey: string | null; status: string; startedAt: string; finishedAt: string | null
  teamsBuilt: number; matchupsBuilt: number; patternContextsBuilt: number; taboosEvaluated: number; notes: string[]; error: string | null
}

export interface ReadinessV6Dto {
  status: string; memoryReadinessScore: number; memoryReliability: string
  homeMemoryState: string; awayMemoryState: string; matchupMaturity: string
  strongContexts: string[]; stayOutContexts: string[]; misleadingContexts: string[]
  memorySupportsPattern: boolean; memoryContradictsPattern: boolean; limitations: string[]
}

export const MEMORY_STATE_LABEL: Record<string, string> = {
  insufficient_history: 'sem histórico', developing: 'em formação', usable: 'utilizável', mature: 'madura',
  insufficient_data: 'sem dados',
}

export const SAMPLE_QUALITY_LABEL: Record<string, string> = {
  strong: 'forte', usable: 'utilizável', weak: 'fraca', insufficient: 'insuficiente', misleading_risk: 'risco enganoso', unknown: 'desconhecida',
}

export const TABOO_STATUS_LABEL: Record<string, string> = {
  candidate: 'candidato', supported: 'suportado', weak_sample: 'amostra fraca', outdated: 'desatualizado',
  contradicted: 'contradito', superstition_risk: 'risco de superstição', not_enough_data: 'sem dados',
}

export const READINESS_V6_LABEL: Record<string, string> = {
  ready_with_memory_support: 'pronto c/ apoio de memória',
  ready_but_memory_weak: 'pronto mas memória fraca',
  insufficient_memory: 'memória insuficiente',
  memory_contradicts_pattern: 'memória contradiz padrão',
  memory_requires_live_confirmation: 'requer confirmação ao vivo',
  stay_out_memory_misleading: 'ficar fora (memória enganosa)',
}
