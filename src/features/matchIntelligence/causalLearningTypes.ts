/**
 * Causal Learning DTOs (B48 / Bloco 5) — frontend mirror.
 * Advisory only: causal classification is NOT a probability/promise; suggestions never
 * auto-apply and require human review.
 */

export type DecisionLinkStrengthDto = 'exact' | 'strong_contextual' | 'temporal_contextual' | 'weak_contextual' | 'unknown'

export interface DecisionTimelineEventDto {
  timestamp: string
  eventType: string
  summary: string
  refs: string[]
  limitations: string[]
}

export interface CausalLearningCaseDto {
  id: string
  fixtureId: string
  patternId: string | null
  alertId: string | null
  opportunityId: string | null
  governanceResultId: string | null
  outcomeId: string | null
  source: string
  createdAt: string
  evaluatedAt: string | null
  outcomeResult: string | null
  governanceAction: string | null
  linkStrength: DecisionLinkStrengthDto
  classification: string
  successCategories: string[]
  failureCategories: string[]
  decisionTimeline: DecisionTimelineEventDto[]
  evidenceRefs: string[]
  dataQuality: string
  evaluable: boolean
  limitations: string[]
}

export interface CausalLearningInsightDto {
  id: string
  fixtureId: string | null
  patternId: string | null
  caseId: string | null
  insightType: string
  severity: 'info' | 'caution' | 'important' | 'critical'
  title: string
  explanation: string
  evidence: string[]
  suggestedRefinement: string | null
  autoApplicable: boolean
  requiresHumanReview: boolean
  createdAt: string
  limitations: string[]
}

export interface GovernanceCalibrationSuggestionDto {
  id: string
  policyArea: string
  currentBehavior: string
  observedIssue: string
  suggestedChange: string
  evidenceCount: number
  sampleQuality: string
  confidenceOfSuggestion: string
  risk: string
  autoApplyAllowed: boolean
  reviewStatus: string
  createdAt: string
  limitations: string[]
}

export interface VariableInfluenceCalibrationSuggestionDto {
  id: string
  variableKey: string
  patternFamily: string
  issue: string
  suggestedMagnitudeChange: string
  evidenceCount: number
  sampleQuality: string
  confidenceOfSuggestion: string
  autoApplyAllowed: boolean
  reviewStatus: string
  createdAt: string
  limitations: string[]
}

export interface CausalLearningRunDto {
  id: string
  scope: string
  fixtureIds: string[]
  startedAt: string
  completedAt: string | null
  status: string
  casesAnalyzed: number
  insightsCreated: number
  suggestionsCreated: number
  notEvaluableCount: number
  notes: string[]
  error: string | null
}

export const CAUSAL_CLASSIFICATION_LABEL: Record<string, string> = {
  good_decision_good_outcome: 'boa decisão / bom resultado', good_decision_bad_outcome: 'boa decisão / mau resultado',
  bad_decision_good_outcome: 'má decisão / bom resultado', bad_decision_bad_outcome: 'má decisão / mau resultado',
  right_to_wait: 'certo em esperar', should_have_waited: 'deveria ter esperado', right_to_stay_out: 'certo em ficar fora',
  should_have_stayed_out: 'deveria ter ficado fora', too_early: 'cedo demais', too_late: 'tarde demais',
  overconservative: 'conservador demais', too_loose: 'frouxo demais', provider_limited: 'limitado por provider',
  data_insufficient: 'dados insuficientes', variance_or_shock: 'variância/choque', not_evaluable: 'não avaliável', unknown: 'desconhecido',
}

export const LINK_STRENGTH_LABEL: Record<string, string> = {
  exact: 'exato', strong_contextual: 'forte contextual', temporal_contextual: 'temporal', weak_contextual: 'fraco', unknown: 'desconhecido',
}
