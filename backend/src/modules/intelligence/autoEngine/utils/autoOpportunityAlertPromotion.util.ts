/**
 * Manual alert promotion guard + preview (Phase B22) — PURE, env-free, smoke-testable.
 * ─────────────────────────────────────────────────────────────────────────────
 * Decides whether an opportunity can be promoted to a monitored alert, and builds
 * the human-facing preview. No persistence, no alert creation, no side effects.
 * Conservative: only strong/watch + risk-gate-allowed + decent data + score≥50.
 */
import type {
  AutoOpportunity, ManualAlertPromotionPreview, ManualPromotedAlertLink, PromotedAlertGuardResult,
} from '../autoEngine.types.js'
import { OPP_TYPE_LABEL } from './autoSignalLabels.util.js'

const MIN_PROMOTION_SCORE = 50

export const REQUIRED_ACKS = [
  'Entendo que isto não é garantia de acerto — o score é qualidade de sinal, não probabilidade.',
  'Entendo que este alerta não envia Telegram nesta fase.',
  'Entendo que não há odds nem aposta envolvidas nesta fase.',
]

export function evaluatePromotionGuard(opp: AutoOpportunity, alreadyPromoted: boolean): PromotedAlertGuardResult {
  const blocked: string[] = []
  if (alreadyPromoted) blocked.push('already_promoted')
  if (opp.status !== 'strong' && opp.status !== 'watch') blocked.push('status_not_promotable')
  if (!opp.riskGate?.allowed) blocked.push('risk_gate_blocked')
  if (opp.evidence?.dataQuality === 'poor' || opp.evidence?.dataQuality === 'unknown') blocked.push('data_quality_insufficient')
  if (opp.score < MIN_PROMOTION_SCORE) blocked.push('score_below_minimum')

  const proposedSeverity: 'critical' | 'attention' | 'info' = opp.status === 'strong' ? 'attention' : 'info'
  const proposedConfidence = Math.max(1, Math.min(99, Math.round(opp.score)))
  return { canPromote: blocked.length === 0, blockedReasons: blocked, proposedSeverity, proposedConfidence }
}

export function buildPromotionPreview(opp: AutoOpportunity, link: ManualPromotedAlertLink | null): ManualAlertPromotionPreview {
  const alreadyPromoted = !!link
  const guard = evaluatePromotionGuard(opp, alreadyPromoted)
  const typeLabel = OPP_TYPE_LABEL[opp.opportunityType] || 'Oportunidade'

  const evidence: string[] = []
  for (const s of opp.evidence?.passedSignals ?? []) evidence.push(s)
  if (opp.evidence?.liveStatsUsed) for (const [k, v] of Object.entries(opp.evidence.liveStatsUsed)) evidence.push(`${k}: ${v}`)
  evidence.push(`Qualidade dos dados: ${opp.evidence?.dataQuality ?? 'unknown'}`)

  const risks: string[] = []
  for (const w of opp.riskGate?.warnings ?? []) risks.push(w)
  if (opp.evidence?.missingData?.length) risks.push(`Dados ausentes: ${opp.evidence.missingData.join(', ')}`)
  if (opp.contextFit?.source === 'heuristic') risks.push('Contexto da competição é heurístico (derivado do nome).')
  if (opp.contextFit?.sampleQuality === 'insufficient') risks.push('Amostra histórica insuficiente — contexto limitado.')

  const limitations: string[] = [
    'Oportunidade não é alerta de radar configurado — é uma promoção pontual e rastreável.',
    'O alerta será monitorado, mas o score não promete acerto.',
    'Sem Telegram, sem odds, sem aposta nesta fase.',
  ]
  if (alreadyPromoted) limitations.unshift('Esta oportunidade já foi promovida — uma nova promoção retorna o alerta existente.')

  return {
    opportunityId: opp.id,
    fixtureId: opp.fixtureId,
    fixtureLabel: opp.fixtureLabel,
    opportunityType: opp.opportunityType,
    proposedAlertTitle: `Motor Automático — ${typeLabel}`,
    proposedAlertReason: opp.explanation?.headline || typeLabel,
    proposedSeverity: guard.proposedSeverity,
    proposedConfidence: guard.proposedConfidence,
    evidence,
    risks,
    dataAvailability: opp.dataAvailability || {},
    limitations,
    canPromote: guard.canPromote,
    blockedReasons: guard.blockedReasons,
    duplicateCheck: { alreadyPromoted, alertId: link?.alertId ?? null },
    requiredConfirmationText: null,
    requiredAcknowledgements: REQUIRED_ACKS,
  }
}
