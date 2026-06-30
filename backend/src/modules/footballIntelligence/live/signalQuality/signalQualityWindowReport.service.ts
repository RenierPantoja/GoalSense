/**
 * Signal Quality Window Report — B71
 * ─────────────────────────────────────────────────────────────────────────────
 * Builds a per-window quality report so each real window becomes a learning unit.
 * Observe only; dataQualityScoreObservational is NOT a probability.
 */
import { createRepositories } from '../../../../repositories/index.js'
import type { LiveFirstSignalQualityCase } from './liveFirstSignalQuality.types.js'
import type { SignalQualityCampaignWindow } from './signalQualityCampaign.types.js'
import type { SignalQualityWindowReport } from './signalQualityWindowReport.types.js'

function ratio(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 1000) / 1000 : 0
}

/**
 * Observational data-quality score in [0,1]: rewards evidence, penalizes missing
 * data / noise. NOT a probability, NOT accuracy, NOT for automated decisions.
 */
function observationalDataQualityScore(cases: LiveFirstSignalQualityCase[]): number {
  if (cases.length === 0) return 0
  let score = 0
  for (const c of cases) {
    if (c.evidenceStrength === 'strong') score += 1
    else if (c.evidenceStrength === 'moderate') score += 0.6
    else if (c.evidenceStrength === 'weak') score += 0.3
    if (c.noiseRisk === 'high') score -= 0.3
  }
  return Math.max(0, Math.min(1, Math.round((score / cases.length) * 1000) / 1000))
}

export function buildSignalQualityWindowReport(
  window: SignalQualityCampaignWindow,
  cases: LiveFirstSignalQualityCase[],
  humanReviewItemsCreated: number,
): SignalQualityWindowReport {
  const total = cases.length
  const casesByGrade: Record<string, number> = {}
  for (const c of cases) casesByGrade[c.qualityGrade] = (casesByGrade[c.qualityGrade] || 0) + 1

  const usefulMap = new Map<string, number>()
  const noisyMap = new Map<string, number>()
  for (const c of cases) {
    if (c.qualityGrade === 'reliable_observe' || c.qualityGrade === 'useful_but_limited') usefulMap.set(c.signalKind, (usefulMap.get(c.signalKind) || 0) + 1)
    if (c.qualityGrade === 'noisy_monitor_only' || c.noiseRisk === 'high') noisyMap.set(c.signalKind, (noisyMap.get(c.signalKind) || 0) + 1)
  }
  const toArr = (m: Map<string, number>) => Array.from(m.entries()).map(([signalKind, count]) => ({ signalKind: signalKind as any, count })).sort((a, b) => b.count - a.count).slice(0, 5)

  const missingStats = cases.filter(c => c.missingEvidence.some(m => /stats|possession|shots/i.test(m))).length
  const missingTimeline = cases.filter(c => c.missingEvidence.some(m => /timeline|event/i.test(m))).length
  const pendingOutcome = cases.filter(c => c.outcomeAlignment === 'pending' || c.outcomeAlignment === 'not_evaluable').length

  const startMs = new Date(window.startedAt).getTime()
  const endMs = window.endedAt ? new Date(window.endedAt).getTime() : Date.now()

  return {
    id: `sqwr_${window.id}`,
    windowId: window.id,
    campaignId: window.campaignId,
    generatedAt: new Date().toISOString(),
    durationMinutes: Math.max(0, Math.round((endMs - startMs) / 60000)),
    fixtures: window.fixturesSelected || 0,
    snapshots: window.snapshotsCaptured || 0,
    casesCreated: window.signalQualityCasesCreated || total,
    casesByGrade,
    humanReviewItemsCreated,
    usefulSignals: toArr(usefulMap),
    noisySignals: toArr(noisyMap),
    missingStatsRatio: ratio(missingStats, total),
    missingTimelineRatio: ratio(missingTimeline, total),
    pendingOutcomeRatio: ratio(pendingOutcome, total),
    dataQualityScoreObservational: observationalDataQualityScore(cases),
    limitations: [
      'Observe only; dataQualityScoreObservational is NOT a probability or accuracy.',
      'Window report compares windows; it never drives automated decisions.',
    ],
  }
}

export async function buildAndSaveLatestWindowReport(campaignId: string): Promise<SignalQualityWindowReport | null> {
  const repos = createRepositories()
  const windows = await repos.intelligence.listSignalQualityCampaignWindows(campaignId, 200).catch(() => [])
  if (windows.length === 0) return null
  const latest = windows[windows.length - 1]
  const cases = await repos.intelligence.listLiveFirstSignalQualityCases(2000).catch(() => [])
  const humanItems = await repos.intelligence.listHumanReviewItems(2000).catch(() => [])
  const report = buildSignalQualityWindowReport(latest, cases as any, humanItems.length)
  await repos.intelligence.saveSignalQualityWindowReport(report).catch(() => {})
  return report
}
