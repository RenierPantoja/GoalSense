/**
 * Threshold Study Readiness V3 — B72
 * ─────────────────────────────────────────────────────────────────────────────
 * Observe-only readiness with an adjudication gate. NEVER changes runtime/policy/
 * threshold/score/confidence. Small sample and unadjudicated queue keep it not_ready.
 */
import { createRepositories } from '../../../../repositories/index.js'
import type { LiveFirstSignalQualityCase } from './liveFirstSignalQuality.types.js'
import type { ThresholdStudyReadiness } from './signalQualityCampaign.types.js'
import type { ThresholdReadinessV3 } from './thresholdReadinessV3.types.js'

const MIN_SAMPLE_FOR_STUDY = 200

function ratio(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 1000) / 1000 : 0
}

export interface ReadinessV3Input {
  cases: LiveFirstSignalQualityCase[]
  untriagedCriticalOrHighValue: number
  unadjudicatedRequiresReview: number
  reviewQueuePending: number
  reviewQueueAdjudicated: number
}

export function evaluateThresholdStudyReadinessV3(input: ReadinessV3Input): { readiness: ThresholdStudyReadiness; reason: string } {
  const { cases, untriagedCriticalOrHighValue, unadjudicatedRequiresReview } = input
  const total = cases.length

  if (total < MIN_SAMPLE_FOR_STUDY && total < 100) {
    return { readiness: 'not_ready_small_sample', reason: `sampleSize ${total} < ${MIN_SAMPLE_FOR_STUDY}` }
  }
  const unknowns = cases.filter(c => c.evidenceStrength === 'unknown' || c.outcomeAlignment === 'unknown').length
  const notEvaluable = cases.filter(c => c.outcomeAlignment === 'not_evaluable' || c.outcomeAlignment === 'pending').length
  if (ratio(unknowns, total) > 0.4 || ratio(notEvaluable, total) > 0.6) {
    return { readiness: 'not_ready_too_many_unknowns', reason: `unknowns=${ratio(unknowns, total)} notEvaluable=${ratio(notEvaluable, total)}` }
  }
  if (untriagedCriticalOrHighValue > 0) {
    return { readiness: 'not_ready_review_queue_untriaged', reason: `${untriagedCriticalOrHighValue} critical/high-value items untriaged` }
  }
  if (unadjudicatedRequiresReview > 0) {
    return { readiness: 'not_ready_review_queue_unadjudicated', reason: `${unadjudicatedRequiresReview} requires-review items not adjudicated` }
  }
  const evaluable = cases.filter(c => c.outcomeAlignment === 'aligned' || c.outcomeAlignment === 'partially_aligned' || c.outcomeAlignment === 'contradicted').length
  if (total >= MIN_SAMPLE_FOR_STUDY && evaluable >= 50) {
    return { readiness: 'ready_for_human_threshold_study', reason: 'sample + outcomes sufficient; queue triaged and adjudicated' }
  }
  return { readiness: 'limited_review_possible', reason: `sample ${total}; partial readiness (study not started)` }
}

export async function buildAndSaveThresholdReadinessV3(): Promise<ThresholdReadinessV3> {
  const repos = createRepositories()
  const cases = await repos.intelligence.listLiveFirstSignalQualityCases(2000).catch(() => [])
  const triageResults = await repos.intelligence.listHumanReviewTriageResults(2000).catch(() => [])
  const items = await repos.intelligence.listHumanReviewItems(2000).catch(() => [])

  const requiresReviewItemIds = new Set(triageResults.filter((t: any) => t.requiresHumanReview).map((t: any) => t.itemId))
  const untriagedCriticalOrHighValue = triageResults.filter((t: any) => (t.bucket === 'critical_review' || t.bucket === 'high_value_review') && !t.itemId).length
  const reviewQueuePending = items.filter((i: any) => i.status === 'pending').length
  const reviewQueueAdjudicated = items.filter((i: any) => i.status === 'reviewed' || i.status === 'needs_more_data' || i.status === 'dismissed').length
  // requires-review items still pending (not yet adjudicated)
  const unadjudicatedRequiresReview = items.filter((i: any) => i.status === 'pending' && requiresReviewItemIds.has(i.id)).length

  const total = cases.length
  const unknowns = cases.filter((c: any) => c.evidenceStrength === 'unknown' || c.outcomeAlignment === 'unknown').length
  const notEvaluable = cases.filter((c: any) => c.outcomeAlignment === 'not_evaluable' || c.outcomeAlignment === 'pending').length
  const evaluable = cases.filter((c: any) => c.outcomeAlignment === 'aligned' || c.outcomeAlignment === 'partially_aligned' || c.outcomeAlignment === 'contradicted').length

  const { readiness, reason } = evaluateThresholdStudyReadinessV3({
    cases: cases as any,
    untriagedCriticalOrHighValue,
    unadjudicatedRequiresReview,
    reviewQueuePending,
    reviewQueueAdjudicated,
  })

  const result: ThresholdReadinessV3 = {
    id: `trv3_${Date.now()}`,
    generatedAt: new Date().toISOString(),
    readiness,
    reason,
    sampleSize: total,
    evaluableCases: evaluable,
    unknownRatio: ratio(unknowns, total),
    notEvaluableRatio: ratio(notEvaluable, total),
    reviewQueuePending,
    reviewQueueAdjudicated,
    untriagedCriticalOrHighValue,
    unadjudicatedRequiresReview,
    minimumSampleForStudy: MIN_SAMPLE_FOR_STUDY,
    changesRuntime: false,
    limitations: [
      'Observe only; readiness never changes runtime, policy, threshold, score, or confidence.',
      'Readiness is a gate for human study, not a probability or accuracy claim.',
    ],
  }
  await repos.intelligence.saveThresholdReadinessV3(result).catch(() => {})
  return result
}
