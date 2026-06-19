/**
 * Promoted alert resolution mapping (Phase B23) — PURE, env-free, smoke-testable.
 * ─────────────────────────────────────────────────────────────────────────────
 * Maps the REAL snapshot analysis of a promoted alert to a conservative, honest
 * outcome by opportunity type. Never invents events. Missing data ⇒ `unknown`
 * (never `failed`). `confirmed_partial` is partial-useful. No odds, no probability.
 */
import type {
  OpportunityType, PromotedAlertResult, PromotedAlertOutcomeLink, AutoOpportunityOutcomeSummary,
} from '../autoEngine.types.js'
import type { LearningEventType } from '../../contracts/intelligence.types.js'

const GOAL_LIKE: OpportunityType[] = [
  'late_goal_pressure', 'first_half_goal_pressure', 'comeback_pressure',
  'dominant_home_pressure', 'dominant_away_pressure',
]

export interface PromotedOutcomeInput {
  opportunityType: OpportunityType
  goalsInWindow: number
  cornersInWindow: number
  cardsInWindow: number
  hasTimedEvents: boolean
  hasStats: boolean
  snapshotsAnalyzed: number
}

export interface PromotedOutcomeDecision {
  result: Exclude<PromotedAlertResult, 'pending' | 'expired'>
  resolutionType: string
  outcomeReason: string
  /** true when the outcome is `unknown` purely due to missing post-promotion data. */
  limited: boolean
}

/**
 * Conservative outcome mapping. Only the snapshot analysis is trusted; the engine
 * never assumes a provider tracks corners/cards unless events prove it.
 */
export function mapPromotedOutcome(i: PromotedOutcomeInput): PromotedOutcomeDecision {
  // No post-promotion data at all ⇒ honestly unknown (limited), regardless of type.
  if (i.snapshotsAnalyzed === 0 || (!i.hasTimedEvents && !i.hasStats)) {
    return { result: 'unknown', resolutionType: 'promoted_no_post_data', limited: true, outcomeReason: 'Sem dados pós-promoção suficientes para avaliar o alerta (unknown, não é falha).' }
  }

  if (GOAL_LIKE.includes(i.opportunityType)) {
    if (i.goalsInWindow > 0 && i.hasTimedEvents) {
      return { result: 'confirmed', resolutionType: 'promoted_goal', limited: false, outcomeReason: `${i.goalsInWindow} gol(s) confirmado(s) por eventos após a promoção.` }
    }
    if (i.goalsInWindow > 0) {
      return { result: 'confirmed_partial', resolutionType: 'promoted_goal', limited: false, outcomeReason: 'Placar mudou após a promoção, mas sem eventos cronometrados para confirmar (parcial-útil).' }
    }
    return { result: 'failed', resolutionType: 'promoted_goal', limited: false, outcomeReason: 'Sem gol na janela monitorada, com dados suficientes para avaliar.' }
  }

  if (i.opportunityType === 'corners_pressure') {
    if (i.cornersInWindow > 0 && i.hasTimedEvents) {
      return { result: 'confirmed', resolutionType: 'promoted_corner', limited: false, outcomeReason: `${i.cornersInWindow} escanteio(s) confirmado(s) por eventos após a promoção.` }
    }
    // No corner events ⇒ we cannot assume the provider tracks corners → unknown, never failed.
    return { result: 'unknown', resolutionType: 'promoted_corner', limited: true, outcomeReason: 'Sem dados de escanteio pós-promoção para confirmar (unknown, nunca falha).' }
  }

  if (i.opportunityType === 'cards_pressure') {
    if (i.cardsInWindow > 0 && i.hasTimedEvents) {
      return { result: 'confirmed', resolutionType: 'promoted_card', limited: false, outcomeReason: `${i.cardsInWindow} cartão(ões) confirmado(s) por eventos após a promoção.` }
    }
    return { result: 'unknown', resolutionType: 'promoted_card', limited: true, outcomeReason: 'Sem dados de cartão pós-promoção para confirmar (unknown, nunca falha).' }
  }

  // pattern_similarity / unknown — only a goal (events or score) is conservatively useful.
  if (i.goalsInWindow > 0) {
    return { result: 'confirmed_partial', resolutionType: 'promoted_generic', limited: false, outcomeReason: 'Gol ocorreu na janela (contexto genérico) — parcial-útil.' }
  }
  return { result: 'unknown', resolutionType: 'promoted_generic', limited: true, outcomeReason: 'Sem sinal conclusivo pós-promoção (unknown, não é falha).' }
}

/** Observational learning-event type for a promoted-alert outcome. */
export function learningTypeForPromotedOutcome(result: PromotedAlertResult, limited: boolean): LearningEventType {
  switch (result) {
    case 'confirmed': return 'auto_opportunity_promoted_alert_confirmed'
    case 'confirmed_partial': return 'auto_opportunity_promoted_alert_partial'
    case 'failed': return 'auto_opportunity_promoted_alert_failed'
    case 'unknown':
    case 'expired':
    case 'pending':
    default:
      return limited ? 'auto_opportunity_promoted_alert_resolution_limited' : 'auto_opportunity_promoted_alert_unknown'
  }
}

export const PROMOTED_RESULT_LABEL: Record<PromotedAlertResult, string> = {
  pending: 'Pendente',
  confirmed: 'Confirmado',
  confirmed_partial: 'Parcial (útil)',
  failed: 'Não confirmado',
  unknown: 'Sem dados (unknown)',
  expired: 'Expirado',
}

/** PURE — build the opportunity-facing outcome summary from a decision. */
export function buildOutcomeSummary(input: {
  opportunityId: string
  promotedAlertId: string
  result: PromotedAlertResult
  outcomeReason: string
  limited: boolean
  timeToResolutionMinutes: number | null
  learningEventIds: string[]
  resolvedAt: string
}): AutoOpportunityOutcomeSummary {
  return {
    opportunityId: input.opportunityId,
    promotedAlertId: input.promotedAlertId,
    result: input.result,
    resultLabel: PROMOTED_RESULT_LABEL[input.result] || input.result,
    outcomeReason: input.outcomeReason,
    confirmedAt: input.result === 'confirmed' || input.result === 'confirmed_partial' ? input.resolvedAt : null,
    failedAt: input.result === 'failed' ? input.resolvedAt : null,
    unknownReason: input.result === 'unknown' || input.result === 'expired' ? input.outcomeReason : null,
    timeToResolutionMinutes: input.timeToResolutionMinutes,
    learningEventIds: input.learningEventIds,
    updatedAt: input.resolvedAt,
  }
}
