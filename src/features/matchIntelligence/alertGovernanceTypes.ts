/**
 * Alert Governance DTOs (B47 / Bloco 4) — frontend mirror.
 * Advisory only: a governance decision is NOT a probability and NOT a promise. In
 * observe/shadow it NEVER blocks a real alert.
 */

export type AlertGovernanceModeDto = 'observe' | 'shadow' | 'shadow_block' | 'enforce'

export type AlertDecisionActionDto =
  | 'allow_alert' | 'allow_monitor_only' | 'wait_for_lineup' | 'wait_for_domain_fetch'
  | 'wait_for_mapping' | 'wait_for_manual_review' | 'wait_for_live_confirmation'
  | 'downgrade_to_monitor' | 'block_alert' | 'stay_out' | 'post_match_learning_only' | 'no_decision'

export interface AlertDecisionGovernanceResultDto {
  id: string
  fixtureId: string
  patternId: string | null
  candidateAlertId: string | null
  opportunityId: string | null
  mode: AlertGovernanceModeDto
  source: string
  action: AlertDecisionActionDto
  severity: string
  generatedAt: string
  readinessStatus: string | null
  precheckDecision: string | null
  influenceBand: string | null
  influenceScore: number | null
  confidenceOfAssessment: string | null
  blockers: string[]
  waitReasons: string[]
  stayOutReasons: string[]
  monitorReasons: string[]
  allowReasons: string[]
  liveConfirmationReasons: string[]
  missingCriticalDomains: string[]
  conflicts: string[]
  wouldHaveBlocked: boolean
  wouldHaveAllowed: boolean
  actuallyBlocked: boolean
  actuallyAllowed: boolean
  actuallyDowngraded: boolean
  limitations: string[]
}

export interface AlertGovernanceHoldDto {
  id: string
  fixtureId: string
  patternId: string | null
  source: string
  reason: string
  createdAt: string
  expiresAt: string
  status: string
  nextRecommendedCheckAt: string | null
  limitations: string[]
}

export interface AlertGovernanceRunDto {
  id: string
  scope: string
  fixtureId: string | null
  trigger: string | null
  status: string
  startedAt: string
  finishedAt: string | null
  resultsCreated: number
  holdsResolved: number
  invalidationsCreated: number
  notes: string[]
}

export interface AssumptionInvalidationDto {
  id: string
  fixtureId: string
  patternId: string | null
  invalidatedAssumption: string
  trigger: string
  severity: string
  recommendedAction: string
  reason: string
  createdAt: string
}

export interface FixtureGovernanceDto {
  mode: AlertGovernanceModeDto
  results: AlertDecisionGovernanceResultDto[]
  holds: AlertGovernanceHoldDto[]
}

export interface GovernanceModeDto {
  mode: AlertGovernanceModeDto
  enabled: boolean
  policy: { description: string }
}

export interface LiveReevaluationOutcomeDto {
  run: AlertGovernanceRunDto
  results: AlertDecisionGovernanceResultDto[]
  resolvedHolds: string[]
  invalidations: AssumptionInvalidationDto[]
  wouldNowAlert: string[]
}

export const GOV_ACTION_LABEL: Record<string, string> = {
  allow_alert: 'permitir alerta', allow_monitor_only: 'apenas monitorar', wait_for_lineup: 'esperar escalação',
  wait_for_domain_fetch: 'esperar dado', wait_for_mapping: 'esperar mapping', wait_for_manual_review: 'esperar revisão',
  wait_for_live_confirmation: 'esperar confirmação ao vivo', downgrade_to_monitor: 'rebaixar p/ monitor',
  block_alert: 'bloquear (advisory)', stay_out: 'ficar fora', post_match_learning_only: 'apenas pós-jogo', no_decision: 'sem decisão',
}

export const GOV_MODE_LABEL: Record<string, string> = {
  observe: 'observe (não bloqueia)', shadow: 'shadow (não bloqueia)', shadow_block: 'shadow-block (marca, não bloqueia)', enforce: 'enforce (ativo)',
}
