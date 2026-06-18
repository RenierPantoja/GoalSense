/**
 * Learning + Failure builders (Phase B12) — deterministic, honest, no fake AI.
 * ─────────────────────────────────────────────────────────────────────────────
 * Failure analysis uses only what the data supports and always speaks in
 * possibilities ("possível", "sugere"), never false certainty. When there isn't
 * enough evidence the reason is `unknown`. Learning events are observations only:
 * they never auto-tune patterns or confidence in this phase.
 */
import type {
  SignalFailureAnalysis, LearningEvent, LearningEventType, FailureReason,
  Confidence, AlertResult,
} from '../contracts/intelligence.types.js'
import { failureId, learningEventId } from '../utils/intelligenceId.util.js'

export interface FailureBuildInput {
  alertId: string
  fixtureId: string
  patternId: string | null
  hasStats: boolean
  hasTimedEvents: boolean
  snapshotsAnalyzed: number
  dataQualityAtResolution: string
  momentumSource: string | null
  dataWarnings: string[]
}

/**
 * Deterministic failure diagnosis. Only ever called when an alert resolves to
 * `failed` (so the resolver already had data). Diagnosis confidence is
 * conservative — `unknown` whenever evidence is thin.
 */
export function buildFailureAnalysis(i: FailureBuildInput): SignalFailureAnalysis {
  const factors: string[] = []
  let reason: FailureReason = 'unknown'
  let confidence: Confidence = 'low'
  let suggestedReview: string | null = null

  if (i.snapshotsAnalyzed === 0) {
    reason = 'missing_required_data'
    confidence = 'medium'
    factors.push('Nenhum snapshot pós-alerta disponível')
    suggestedReview = 'Possível lacuna de coleta ao vivo; verificar cobertura do provedor para esta liga.'
  } else if (!i.hasStats && !i.hasTimedEvents) {
    reason = 'missing_required_data'
    confidence = 'medium'
    factors.push('Sem estatísticas e sem eventos cronometrados na janela')
    suggestedReview = 'Provedor não entregou dados ricos; o resultado pode ter ocorrido sem registro.'
  } else if (i.dataQualityAtResolution === 'poor') {
    reason = 'data_poor'
    confidence = 'medium'
    factors.push('Qualidade de dados pobre na resolução')
    suggestedReview = 'Cobertura fraca pode ter impedido a confirmação; considerar exigir dados ricos.'
  } else if (i.momentumSource === 'insufficient' || i.momentumSource === 'stats_proxy') {
    reason = 'weak_momentum'
    confidence = 'low'
    factors.push(`Momentum fraco (fonte: ${i.momentumSource})`)
    suggestedReview = 'Sugere revisar gatilhos de pressão ofensiva; o sinal pode ter sido cedo demais.'
  } else {
    reason = 'random_outcome_possible'
    confidence = 'low'
    factors.push('Dados suficientes, sem causa clara de falha')
    suggestedReview = 'Possível variância natural do jogo; acompanhar mais amostras antes de ajustar o radar.'
  }

  for (const w of i.dataWarnings) factors.push(w)

  return {
    id: failureId(i.alertId),
    alertId: i.alertId,
    fixtureId: i.fixtureId,
    patternId: i.patternId,
    failureReason: reason,
    contributingFactors: factors,
    suggestedReview,
    confidenceInDiagnosis: confidence,
    createdAt: new Date().toISOString(),
  }
}

/** Map an alert resolution result to its learning-event type. */
export function learningTypeForResult(result: AlertResult): LearningEventType {
  switch (result) {
    case 'confirmed': return 'alert_confirmed'
    case 'confirmed_partial': return 'alert_confirmed_partial'
    case 'failed': return 'alert_failed'
    default: return 'alert_unknown'
  }
}

export function buildLearningEvent(input: {
  type: LearningEventType
  fixtureId: string | null
  alertId: string | null
  patternId: string | null
  contextKey: string
  message: string
  evidenceRef?: string | null
  confidence?: Confidence
}): LearningEvent {
  return {
    id: learningEventId(),
    type: input.type,
    fixtureId: input.fixtureId,
    alertId: input.alertId,
    patternId: input.patternId,
    contextKey: input.contextKey,
    message: input.message,
    evidenceRef: input.evidenceRef ?? null,
    confidence: input.confidence ?? 'low',
    createdAt: new Date().toISOString(),
  }
}
