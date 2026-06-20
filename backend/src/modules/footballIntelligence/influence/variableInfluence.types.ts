/**
 * Variable Influence Engine — Contracts (B46 / Bloco 3).
 * ─────────────────────────────────────────────────────────────────────────────
 * Advisory/shadow layer that evaluates HOW each variable affects the operational
 * strength of a pattern/opportunity/decision. Inviolable rules encoded here:
 *   - influence is NOT a probability; influenceScore is internal operational weight;
 *   - confidenceOfAssessment is confidence in the ASSESSMENT, not in the match result;
 *   - an absent variable never becomes a negative variable automatically;
 *   - small sample never becomes strong; H2H insufficient is never a tabu;
 *   - manual stays manual, provider stays provider, conflict is always explicit;
 *   - unknown / not_evaluable are never `failed`.
 * Optional fields keep forward/backward compatibility.
 */

export type VariableInfluenceDirection =
  | 'positive' | 'negative' | 'neutral' | 'uncertain'
  | 'blocking' | 'wait' | 'live_confirmation_required' | 'post_match_only'

export type VariableInfluenceMagnitude =
  | 'critical' | 'high' | 'medium' | 'low' | 'negligible' | 'unknown'

export type VariableInfluenceSource =
  | 'provider_data' | 'manual_data' | 'internal_memory' | 'live_state'
  | 'post_match_learning' | 'backtest' | 'replay' | 'session_validation'
  | 'evidence_lineage' | 'derived_context' | 'unknown'

export type VariableInfluenceReliability =
  | 'high' | 'medium' | 'low' | 'weak_sample' | 'stale' | 'conflicting' | 'unavailable' | 'unknown'

export type VariableInfluenceCategory =
  | 'lineup' | 'injury' | 'suspension' | 'squad_depth' | 'player_importance'
  | 'home_away' | 'team_form' | 'h2h' | 'competition_context' | 'match_importance'
  | 'rivalry' | 'knockout' | 'table_pressure' | 'tactical_matchup' | 'card_risk'
  | 'goal_environment' | 'team_memory' | 'matchup_memory' | 'pattern_memory'
  | 'taboo' | 'similar_scenario' | 'provider_quality' | 'data_readiness'
  | 'live_event' | 'post_match_learning'

export interface VariableInfluenceInput {
  id: string
  fixtureId: string
  patternId?: string | null
  variableKey: string
  category: VariableInfluenceCategory
  label: string
  rawValue: string
  normalizedValue?: string
  source: VariableInfluenceSource
  dataQuality: 'rich' | 'partial' | 'poor' | 'unavailable' | 'unknown'
  sampleQuality?: 'strong' | 'usable' | 'weak' | 'insufficient' | 'misleading_risk' | 'unknown'
  reliability: VariableInfluenceReliability
  evidenceRefs?: string[]
  limitations: string[]
}

export interface VariableInfluenceAssessment {
  id: string
  fixtureId: string
  patternId?: string | null
  variableKey: string
  category: VariableInfluenceCategory
  label: string
  direction: VariableInfluenceDirection
  magnitude: VariableInfluenceMagnitude
  reliability: VariableInfluenceReliability
  source: VariableInfluenceSource
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

export type PatternFamily =
  | 'goals' | 'btts' | 'clean_sheet' | 'comeback' | 'late_goal' | 'first_half_goal'
  | 'second_half_goal' | 'cards' | 'red_card' | 'pressure' | 'momentum'
  | 'defensive_collapse' | 'favorite_dominance' | 'underdog_resistance' | 'unknown'

export interface PatternVariableSensitivityProfile {
  patternId: string
  patternName: string
  patternFamily: PatternFamily
  sensitiveCategories: VariableInfluenceCategory[]
  criticalVariables: string[]
  blockingVariables: string[]
  waitVariables: string[]
  liveConfirmationVariables: string[]
  lowImpactVariables: string[]
  notes: string[]
  limitations: string[]
}

export type NetInfluenceBand =
  | 'strongly_supportive' | 'supportive' | 'mixed' | 'weak'
  | 'contradictory' | 'blocked' | 'insufficient_data' | 'unknown'

export interface InfluenceAggregate {
  fixtureId: string
  patternId?: string | null
  generatedAt: string
  positiveInfluences: VariableInfluenceAssessment[]
  negativeInfluences: VariableInfluenceAssessment[]
  blockingInfluences: VariableInfluenceAssessment[]
  waitInfluences: VariableInfluenceAssessment[]
  uncertaintyInfluences: VariableInfluenceAssessment[]
  liveConfirmationInfluences: VariableInfluenceAssessment[]
  netInfluenceBand: NetInfluenceBand
  /** Internal operational weight, NOT a probability of winning. */
  influenceScore: number
  confidenceOfAssessment: 'high' | 'medium' | 'low' | 'unknown'
  dataCompleteness: number
  keyReasons: string[]
  stayOutReasons: string[]
  waitReasons: string[]
  limitations: string[]
}

export type VariableConflictType =
  | 'provider_vs_manual' | 'memory_vs_lineup' | 'h2h_vs_context'
  | 'pattern_vs_missing_provider' | 'probable_vs_confirmed_lineup'
  | 'memory_vs_recent_sample' | 'stale_domain_vs_recent_manual'

export type VariableConflictAction =
  | 'operator_review' | 'wait' | 'use_manual_high_reliability'
  | 'downgrade' | 'stay_out' | 'live_confirmation'

export interface VariableConflict {
  id: string
  fixtureId: string
  patternId?: string | null
  conflictType: VariableConflictType
  severity: 'low' | 'medium' | 'high'
  involvedVariables: string[]
  recommendedAction: VariableConflictAction
  reason: string
  limitations: string[]
}

export interface InfluenceLedgerEntry {
  id: string
  fixtureId: string
  patternId: string | null
  generatedAt: string
  packageVersion: string
  variables: VariableInfluenceInput[]
  assessments: VariableInfluenceAssessment[]
  aggregate: InfluenceAggregate
  decisionInputsCreated: number
  source: VariableInfluenceSource
  limitations: string[]
}

export interface InfluenceBuildRun {
  id: string
  scope: 'fixture' | 'pattern'
  fixtureId: string
  patternId: string | null
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  startedAt: string
  finishedAt: string | null
  variablesExtracted: number
  assessmentsBuilt: number
  conflictsFound: number
  notes: string[]
  error: string | null
}
