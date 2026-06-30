/**
 * Live-First Signal Reliability Baseline — B70
 * ─────────────────────────────────────────────────────────────────────────────
 * Simple, NON-probabilistic observational baseline over signal-quality cases.
 * It is NOT accuracy, NOT a prediction, NOT a probability. Small samples are
 * flagged not_ready. Observe only.
 */
import { createRepositories } from '../../../../repositories/index.js'
import type { LiveFirstSignalQualityCase } from './liveFirstSignalQuality.types.js'
import type { SignalReliabilityBaseline, ThresholdStudyReadiness } from './signalQualityCampaign.types.js'

const MIN_SAMPLE_FOR_STUDY = 200

function ratio(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 1000) / 1000 : 0
}

export function evaluateThresholdStudyReadiness(cases: LiveFirstSignalQualityCase[]): ThresholdStudyReadiness {
  const total = cases.length
  if (total < MIN_SAMPLE_FOR_STUDY) return 'not_ready_small_sample'
  const unknowns = cases.filter(c => c.evidenceStrength === 'unknown' || c.outcomeAlignment === 'unknown').length
  if (ratio(unknowns, total) > 0.4) return 'not_ready_too_many_unknowns'
  const notEvaluable = cases.filter(c => c.outcomeAlignment === 'not_evaluable' || c.outcomeAlignment === 'pending').length
  if (ratio(notEvaluable, total) > 0.6) return 'not_ready_missing_outcomes'
  const evaluable = cases.filter(c => c.outcomeAlignment === 'aligned' || c.outcomeAlignment === 'partially_aligned' || c.outcomeAlignment === 'contradicted').length
  if (evaluable < 50) return 'limited_review_possible'
  return 'ready_for_human_threshold_study'
}

export function buildReliabilityBaseline(cases: LiveFirstSignalQualityCase[], humanReviewCount = 0): SignalReliabilityBaseline {
  const total = cases.length

  const byKindMap = new Map<string, LiveFirstSignalQualityCase[]>()
  for (const c of cases) {
    const arr = byKindMap.get(c.signalKind) || []
    arr.push(c); byKindMap.set(c.signalKind, arr)
  }
  const bySignalKind = Array.from(byKindMap.entries()).map(([signalKind, arr]) => ({
    signalKind: signalKind as any,
    sampleSize: arr.length,
    strongRatio: ratio(arr.filter(c => c.evidenceStrength === 'strong').length, arr.length),
    insufficientRatio: ratio(arr.filter(c => c.evidenceStrength === 'insufficient').length, arr.length),
    notEvaluableRatio: ratio(arr.filter(c => c.outcomeAlignment === 'not_evaluable' || c.outcomeAlignment === 'pending').length, arr.length),
  })).sort((a, b) => b.sampleSize - a.sampleSize)

  const dist = <T extends string>(key: (c: LiveFirstSignalQualityCase) => T): Record<T, number> => {
    const m = {} as Record<T, number>
    for (const c of cases) { const k = key(c); m[k] = (m[k] || 0) + 1 }
    return m
  }

  const notEvaluable = cases.filter(c => c.outcomeAlignment === 'not_evaluable' || c.outcomeAlignment === 'pending').length
  const insufficient = cases.filter(c => c.evidenceStrength === 'insufficient').length
  const stale = cases.filter(c => c.missingEvidence.some(m => m.toLowerCase().includes('stale') || m.toLowerCase().includes('freshness'))).length
  const missingStats = cases.filter(c => c.missingEvidence.some(m => m.toLowerCase().includes('stats') || m.toLowerCase().includes('possession') || m.toLowerCase().includes('shots'))).length
  const missingTimeline = cases.filter(c => c.missingEvidence.some(m => m.toLowerCase().includes('timeline') || m.toLowerCase().includes('keyevents') || m.toLowerCase().includes('event'))).length

  const readiness = evaluateThresholdStudyReadiness(cases)

  return {
    id: `srb_${Date.now()}`,
    generatedAt: new Date().toISOString(),
    sampleSize: total,
    bySignalKind,
    evidenceStrengthDistribution: dist(c => c.evidenceStrength) as any,
    qualityGradeDistribution: dist(c => c.qualityGrade) as any,
    outcomeAlignmentDistribution: dist(c => c.outcomeAlignment) as any,
    noiseRiskDistribution: dist(c => c.noiseRisk) as any,
    notEvaluableRatio: ratio(notEvaluable, total),
    insufficientDataRatio: ratio(insufficient, total),
    staleSnapshotRatio: ratio(stale, total),
    missingStatsRatio: ratio(missingStats, total),
    missingTimelineRatio: ratio(missingTimeline, total),
    humanReviewRatio: ratio(humanReviewCount, total),
    consistencyNote: total < MIN_SAMPLE_FOR_STUDY
      ? 'Observational only; sample too small to call this accuracy or reliability.'
      : 'Observational consistency note; NOT a probability or accuracy claim.',
    thresholdStudyReadiness: readiness,
    limitations: [
      'Baseline is observational, not probabilistic; never a prediction or bet signal.',
      'Missing data is reported as ratios, never treated as zero outcome.',
      `Minimum sample for threshold study is ${MIN_SAMPLE_FOR_STUDY}.`,
    ],
  }
}

export async function buildAndSaveReliabilityBaseline(): Promise<SignalReliabilityBaseline> {
  const repos = createRepositories()
  const cases = await repos.intelligence.listLiveFirstSignalQualityCases(2000).catch(() => [])
  const humanItems = await repos.intelligence.listHumanReviewItems(2000).catch(() => [])
  const baseline = buildReliabilityBaseline(cases, humanItems.length)
  await repos.intelligence.saveSignalReliabilityBaseline(baseline).catch(() => {})
  return baseline
}
