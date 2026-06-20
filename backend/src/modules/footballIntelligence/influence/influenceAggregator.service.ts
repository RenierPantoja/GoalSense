/**
 * Influence Aggregator (B46 / Bloco 3) — PURE.
 * ─────────────────────────────────────────────────────────────────────────────
 * Combines per-variable assessments into one operational reading. Logic:
 *   - blocking dominates; wait dominates when temporal/critical data is missing;
 *   - contradiction reduces strength; supportive-with-weak-sample never becomes strong;
 *   - strong positive + strong negative → mixed; critical absence → insufficient_data;
 *   - low reliability lowers confidenceOfAssessment.
 * influenceScore is an INTERNAL operational weight, NOT a probability of winning.
 */
import type {
  VariableInfluenceAssessment, InfluenceAggregate, NetInfluenceBand, VariableInfluenceMagnitude,
} from './variableInfluence.types.js'

const MAG_WEIGHT: Record<VariableInfluenceMagnitude, number> = {
  critical: 4, high: 3, medium: 2, low: 1, negligible: 0.25, unknown: 0,
}
const REL_FACTOR: Record<string, number> = {
  high: 1, medium: 0.7, low: 0.45, weak_sample: 0.3, stale: 0.3, conflicting: 0.3, unavailable: 0, unknown: 0,
}

export function detectBlockers(assessments: VariableInfluenceAssessment[]): VariableInfluenceAssessment[] {
  return assessments.filter(a => a.direction === 'blocking' || a.blocks)
}
export function detectWaitReasons(assessments: VariableInfluenceAssessment[]): VariableInfluenceAssessment[] {
  return assessments.filter(a => a.direction === 'wait')
}
export function detectContradictions(assessments: VariableInfluenceAssessment[]): VariableInfluenceAssessment[] {
  return assessments.filter(a => a.direction === 'negative' || a.contradicts)
}

function weighted(list: VariableInfluenceAssessment[]): number {
  return list.reduce((s, a) => s + MAG_WEIGHT[a.magnitude] * (REL_FACTOR[a.reliability] ?? 0), 0)
}

export function buildNetInfluenceBand(assessments: VariableInfluenceAssessment[]): NetInfluenceBand {
  if (assessments.length === 0) return 'unknown'
  const blocking = assessments.filter(a => a.direction === 'blocking')
  const positive = assessments.filter(a => a.direction === 'positive')
  const negative = assessments.filter(a => a.direction === 'negative')
  const usable = assessments.filter(a => a.reliability !== 'unavailable' && a.reliability !== 'unknown')

  if (blocking.length > 0) return 'blocked'
  if (usable.length === 0) return 'insufficient_data'

  const pos = weighted(positive)
  const neg = weighted(negative)
  const strongPos = positive.some(a => (a.magnitude === 'critical' || a.magnitude === 'high') && (a.reliability === 'high' || a.reliability === 'medium'))
  const strongNeg = negative.some(a => (a.magnitude === 'critical' || a.magnitude === 'high') && (a.reliability === 'high' || a.reliability === 'medium'))

  if (strongPos && strongNeg) return 'mixed'
  if (pos > 0 && neg > 0 && Math.abs(pos - neg) < 1) return 'mixed'
  if (neg > pos && strongNeg) return 'contradictory'
  if (pos >= neg * 2 && strongPos) return 'strongly_supportive'
  if (pos > neg) return 'supportive'
  if (neg > pos) return 'contradictory'
  return 'weak'
}

export function aggregateInfluences(fixtureId: string, patternId: string | null, assessments: VariableInfluenceAssessment[]): InfluenceAggregate {
  const positiveInfluences = assessments.filter(a => a.direction === 'positive')
  const negativeInfluences = assessments.filter(a => a.direction === 'negative')
  const blockingInfluences = assessments.filter(a => a.direction === 'blocking')
  const waitInfluences = assessments.filter(a => a.direction === 'wait')
  const liveConfirmationInfluences = assessments.filter(a => a.direction === 'live_confirmation_required')
  const uncertaintyInfluences = assessments.filter(a => a.direction === 'uncertain' || a.direction === 'neutral')

  const netInfluenceBand = buildNetInfluenceBand(assessments)

  // Internal operational weight (NOT a probability). Centered at 0; pos lifts, neg/block lowers.
  let influenceScore = weighted(positiveInfluences) - weighted(negativeInfluences) - blockingInfluences.length * 3 - waitInfluences.length * 1.5
  influenceScore = Math.round(influenceScore * 10) / 10

  const usable = assessments.filter(a => a.reliability === 'high' || a.reliability === 'medium')
  const dataCompleteness = assessments.length === 0 ? 0 : Math.round((usable.length / assessments.length) * 100)

  let confidenceOfAssessment: InfluenceAggregate['confidenceOfAssessment']
  if (assessments.length === 0 || netInfluenceBand === 'insufficient_data') confidenceOfAssessment = 'unknown'
  else if (dataCompleteness >= 60 && usable.length >= 3) confidenceOfAssessment = 'high'
  else if (dataCompleteness >= 30) confidenceOfAssessment = 'medium'
  else confidenceOfAssessment = 'low'

  const keyReasons: string[] = []
  for (const a of [...blockingInfluences, ...waitInfluences, ...positiveInfluences, ...negativeInfluences].slice(0, 6)) keyReasons.push(a.reason)

  const stayOutReasons: string[] = []
  if (netInfluenceBand === 'blocked') stayOutReasons.push('Influência bloqueadora presente — não decidir até resolver.')
  if (netInfluenceBand === 'contradictory') stayOutReasons.push('Fatores contradizem o padrão.')

  const waitReasons = waitInfluences.map(a => a.waitReason || a.reason)
  const liveReasons = liveConfirmationInfluences.map(a => a.liveConfirmationReason || a.reason)

  return {
    fixtureId, patternId, generatedAt: new Date().toISOString(),
    positiveInfluences, negativeInfluences, blockingInfluences, waitInfluences, uncertaintyInfluences, liveConfirmationInfluences,
    netInfluenceBand, influenceScore, confidenceOfAssessment, dataCompleteness,
    keyReasons, stayOutReasons, waitReasons: [...new Set([...waitReasons, ...liveReasons])],
    limitations: [
      'influenceScore é peso operacional interno, NÃO probabilidade de acerto.',
      'confidenceOfAssessment é confiança na avaliação, não no resultado do jogo.',
    ],
  }
}

export function buildInfluenceSummary(aggregate: InfluenceAggregate): string {
  return `${aggregate.netInfluenceBand} · score ${aggregate.influenceScore} · confiança ${aggregate.confidenceOfAssessment} · +${aggregate.positiveInfluences.length}/-${aggregate.negativeInfluences.length}/bloq ${aggregate.blockingInfluences.length}/wait ${aggregate.waitInfluences.length}`
}
