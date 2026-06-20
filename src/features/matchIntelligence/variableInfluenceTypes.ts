/**
 * Variable Influence DTOs (B46 / Bloco 3) — frontend mirror.
 * Advisory only: influence is NOT a probability; influenceScore is internal weight;
 * confidenceOfAssessment is confidence in the assessment, not the match result.
 */

export type VariableInfluenceDirectionDto =
  | 'positive' | 'negative' | 'neutral' | 'uncertain'
  | 'blocking' | 'wait' | 'live_confirmation_required' | 'post_match_only'

export type VariableInfluenceMagnitudeDto = 'critical' | 'high' | 'medium' | 'low' | 'negligible' | 'unknown'
export type NetInfluenceBandDto =
  | 'strongly_supportive' | 'supportive' | 'mixed' | 'weak' | 'contradictory' | 'blocked' | 'insufficient_data' | 'unknown'

export interface VariableInfluenceAssessmentDto {
  id: string
  fixtureId: string
  patternId?: string | null
  variableKey: string
  category: string
  label: string
  direction: VariableInfluenceDirectionDto
  magnitude: VariableInfluenceMagnitudeDto
  reliability: string
  source: string
  reason: string
  evidenceRefs: string[]
  contradicts: boolean
  supports: boolean
  blocks: boolean
  waitReason?: string | null
  liveConfirmationReason?: string | null
  limitations: string[]
  createdAt: string
}

export interface InfluenceAggregateDto {
  fixtureId: string
  patternId?: string | null
  generatedAt: string
  positiveInfluences: VariableInfluenceAssessmentDto[]
  negativeInfluences: VariableInfluenceAssessmentDto[]
  blockingInfluences: VariableInfluenceAssessmentDto[]
  waitInfluences: VariableInfluenceAssessmentDto[]
  uncertaintyInfluences: VariableInfluenceAssessmentDto[]
  liveConfirmationInfluences: VariableInfluenceAssessmentDto[]
  netInfluenceBand: NetInfluenceBandDto
  influenceScore: number
  confidenceOfAssessment: 'high' | 'medium' | 'low' | 'unknown'
  dataCompleteness: number
  keyReasons: string[]
  stayOutReasons: string[]
  waitReasons: string[]
  limitations: string[]
}

export interface VariableConflictDto {
  id: string
  fixtureId: string
  patternId?: string | null
  conflictType: string
  severity: 'low' | 'medium' | 'high'
  involvedVariables: string[]
  recommendedAction: string
  reason: string
  limitations: string[]
}

export interface PatternSensitivityDto {
  patternId: string
  patternName: string
  patternFamily: string
  sensitiveCategories: string[]
  criticalVariables: string[]
  blockingVariables: string[]
  waitVariables: string[]
  liveConfirmationVariables: string[]
  lowImpactVariables: string[]
  notes: string[]
  limitations: string[]
}

export interface ComposedInfluenceDto {
  fixtureId: string
  patternId: string | null
  sensitivity: PatternSensitivityDto
  variables: Array<{ variableKey: string; category: string; label: string; source: string; reliability: string; limitations: string[] }>
  assessments: VariableInfluenceAssessmentDto[]
  aggregate: InfluenceAggregateDto
  conflicts: VariableConflictDto[]
  summary: string
}

export interface InfluenceBuildRunDto {
  id: string
  scope: string
  fixtureId: string
  patternId: string | null
  status: string
  startedAt: string
  finishedAt: string | null
  variablesExtracted: number
  assessmentsBuilt: number
  conflictsFound: number
  notes: string[]
  error: string | null
}

export interface ReadinessV7Dto {
  status: string
  influenceReadiness: number
  blockerCount: number
  waitInfluenceCount: number
  contradictionCount: number
  supportiveInfluenceCount: number
  liveConfirmationCount: number
  missingCriticalInfluenceDomains: string[]
  netInfluenceBand: string
  influenceConfidenceOfAssessment: string
  limitations: string[]
}

export const NET_BAND_LABEL: Record<string, string> = {
  strongly_supportive: 'fortemente favorável', supportive: 'favorável', mixed: 'misto', weak: 'fraco',
  contradictory: 'contraditório', blocked: 'bloqueado', insufficient_data: 'dados insuficientes', unknown: 'desconhecido',
}

export const DIRECTION_LABEL: Record<string, string> = {
  positive: 'apoia', negative: 'contradiz', neutral: 'neutro', uncertain: 'incerto',
  blocking: 'bloqueia', wait: 'esperar', live_confirmation_required: 'confirmar ao vivo', post_match_only: 'pós-jogo',
}

export const READINESS_V7_LABEL: Record<string, string> = {
  ready_with_supportive_influence: 'pronto c/ influência favorável',
  ready_but_mixed_influence: 'pronto mas influência mista',
  wait_due_to_influence: 'esperar (influência)',
  blocked_by_influence: 'bloqueado por influência',
  insufficient_influence_data: 'influência insuficiente',
  live_confirmation_required_by_influence: 'requer confirmação ao vivo',
}
