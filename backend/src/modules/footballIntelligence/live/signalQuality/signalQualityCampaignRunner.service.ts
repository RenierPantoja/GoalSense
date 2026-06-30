/**
 * Signal Quality Campaign Runner — B70
 * ─────────────────────────────────────────────────────────────────────────────
 * Tracks a multi-window live-first signal quality campaign. Each window can run a
 * worker session; results accumulate into a sample. Observe only — no calibration,
 * no thresholds applied; only readiness is assessed. No-live-fixtures is not a failure.
 */
import { createRepositories } from '../../../../repositories/index.js'
import { buildAndSaveHumanReviewQueue, getHumanReviewQueueSize } from './liveFirstHumanReviewQueue.service.js'
import { buildAndSaveReliabilityBaseline, evaluateThresholdStudyReadiness } from './liveFirstSignalReliabilityBaseline.service.js'
import type {
  SignalQualityCampaign,
  SignalQualityCampaignWindow,
  SignalQualityCampaignSummary,
  SignalQualityCampaignWindowStatus,
  ThresholdStudyReadiness,
} from './signalQualityCampaign.types.js'

export async function createSignalQualityCampaign(opts: {
  name: string
  targetWindows?: number
  targetMinimumCases?: number
  targetMinimumCompletedFixtures?: number
}): Promise<SignalQualityCampaign> {
  const repos = createRepositories()
  const now = new Date().toISOString()
  const campaign: SignalQualityCampaign = {
    id: `sqcamp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: opts.name,
    startedAt: now,
    status: 'running',
    targetWindows: opts.targetWindows ?? 10,
    completedWindows: 0,
    targetMinimumCases: opts.targetMinimumCases ?? 300,
    targetMinimumCompletedFixtures: opts.targetMinimumCompletedFixtures ?? 30,
    totalWorkerRuns: 0,
    totalSessions: 0,
    totalFixtures: 0,
    totalSnapshots: 0,
    totalSignalQualityCases: 0,
    totalEvaluableCases: 0,
    totalNotEvaluableCases: 0,
    limitations: ['Observe only; no calibration, thresholds, policy, or score changes.'],
    createdAt: now,
    updatedAt: now,
  }
  await repos.intelligence.saveSignalQualityCampaign(campaign)
  return campaign
}

export async function startCampaignWindow(campaignId: string, windowLabel: string): Promise<SignalQualityCampaignWindow> {
  const repos = createRepositories()
  const now = new Date().toISOString()
  const window: SignalQualityCampaignWindow = {
    id: `sqwin_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    campaignId,
    windowLabel,
    startedAt: now,
    status: 'running',
    fixturesSelected: 0,
    snapshotsCaptured: 0,
    postMatchFixturesProcessed: 0,
    signalQualityCasesCreated: 0,
    signalQualityReviewId: null,
    freshness: null,
    limitations: [],
  }
  await repos.intelligence.saveSignalQualityCampaignWindow(window)
  return window
}

export async function attachWorkerRunToWindow(windowId: string, campaignId: string, patch: Partial<SignalQualityCampaignWindow>): Promise<void> {
  const repos = createRepositories()
  const windows = await repos.intelligence.listSignalQualityCampaignWindows(campaignId, 200)
  const w = windows.find(x => x.id === windowId)
  if (!w) return
  await repos.intelligence.saveSignalQualityCampaignWindow({ ...w, ...patch })
}

export async function completeCampaignWindow(
  campaignId: string,
  windowId: string,
  status: SignalQualityCampaignWindowStatus,
  patch: Partial<SignalQualityCampaignWindow> = {},
): Promise<void> {
  const repos = createRepositories()
  const windows = await repos.intelligence.listSignalQualityCampaignWindows(campaignId, 200)
  const w = windows.find(x => x.id === windowId)
  if (w) {
    await repos.intelligence.saveSignalQualityCampaignWindow({ ...w, ...patch, status, endedAt: new Date().toISOString() })
  }
  // Recompute campaign rollups.
  const campaign = await repos.intelligence.getSignalQualityCampaign(campaignId)
  if (!campaign) return
  const allWindows = await repos.intelligence.listSignalQualityCampaignWindows(campaignId, 500)
  const completed = allWindows.filter(x => x.status === 'completed' || x.status === 'completed_with_warnings' || x.status === 'skipped_no_live_fixtures')
  const cases = await repos.intelligence.listLiveFirstSignalQualityCases(2000).catch(() => [])
  await repos.intelligence.saveSignalQualityCampaign({
    ...campaign,
    completedWindows: completed.length,
    totalSnapshots: allWindows.reduce((s, x) => s + (x.snapshotsCaptured || 0), 0),
    totalFixtures: allWindows.reduce((s, x) => s + (x.fixturesSelected || 0), 0),
    totalSignalQualityCases: cases.length,
    totalEvaluableCases: cases.filter((c: any) => c.outcomeAlignment === 'aligned' || c.outcomeAlignment === 'partially_aligned' || c.outcomeAlignment === 'contradicted').length,
    totalNotEvaluableCases: cases.filter((c: any) => c.outcomeAlignment === 'not_evaluable' || c.outcomeAlignment === 'pending').length,
    updatedAt: new Date().toISOString(),
  })
}

export async function buildCampaignSummary(campaignId: string): Promise<SignalQualityCampaignSummary | null> {
  const repos = createRepositories()
  const campaign = await repos.intelligence.getSignalQualityCampaign(campaignId)
  if (!campaign) return null
  const cases = await repos.intelligence.listLiveFirstSignalQualityCases(2000).catch(() => [])
  const review = await repos.intelligence.getLatestLiveFirstSignalQualityReview().catch(() => null)
  const humanReviewQueueSize = await getHumanReviewQueueSize().catch(() => 0)
  const readiness = evaluateThresholdStudyReadiness(cases as any)

  const count = (g: string) => cases.filter((c: any) => c.qualityGrade === g).length
  const recommendations: string[] = []
  if (readiness === 'not_ready_small_sample') recommendations.push('Accumulate more windows before any threshold study.')
  if (humanReviewQueueSize > 0) recommendations.push(`${humanReviewQueueSize} item(s) pending human review.`)

  return {
    campaignId,
    generatedAt: new Date().toISOString(),
    sampleSize: cases.length,
    windowsCompleted: campaign.completedWindows,
    reliableObserve: count('reliable_observe'),
    usefulButLimited: count('useful_but_limited'),
    noisyMonitorOnly: count('noisy_monitor_only'),
    insufficientData: count('insufficient_data'),
    misleadingCandidate: count('misleading_candidate'),
    pendingMoreSample: count('pending_more_sample'),
    topUsefulSignals: review?.topUsefulSignals ?? [],
    topNoisySignals: review?.topNoisySignals ?? [],
    humanReviewQueueSize,
    thresholdStudyReadiness: readiness,
    recommendations,
    limitations: [
      'Observe only; threshold readiness never changes runtime.',
      'Baseline/readiness are observational, not probability or accuracy.',
    ],
  }
}

export async function updateCampaignStatus(campaignId: string, status: SignalQualityCampaign['status']): Promise<void> {
  const repos = createRepositories()
  const campaign = await repos.intelligence.getSignalQualityCampaign(campaignId)
  if (!campaign) return
  await repos.intelligence.saveSignalQualityCampaign({ ...campaign, status, endedAt: status.startsWith('completed') || status === 'failed' ? new Date().toISOString() : campaign.endedAt, updatedAt: new Date().toISOString() })
}

export { evaluateThresholdStudyReadiness }
export type { ThresholdStudyReadiness }

/** Convenience: refresh human review queue + triage + baseline + window report. */
export async function refreshCampaignDerivedArtifacts(campaignId?: string): Promise<{ humanReviewQueueSize: number; readiness: ThresholdStudyReadiness }> {
  await buildAndSaveHumanReviewQueue().catch(() => [])
  const { saveHumanReviewTriageRun } = await import('./liveFirstHumanReviewTriage.service.js')
  await saveHumanReviewTriageRun().catch(() => null)
  const baseline = await buildAndSaveReliabilityBaseline().catch(() => null)
  if (campaignId) {
    const { buildAndSaveLatestWindowReport } = await import('./signalQualityWindowReport.service.js')
    await buildAndSaveLatestWindowReport(campaignId).catch(() => null)
  }
  const size = await getHumanReviewQueueSize().catch(() => 0)
  return { humanReviewQueueSize: size, readiness: baseline?.thresholdStudyReadiness ?? 'not_ready_small_sample' }
}
