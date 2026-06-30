#!/usr/bin/env node
/** Run a Signal Quality Campaign Window — B70 CLI (local worker only). */
process.env.DATABASE_URL ||= 'file:./local.db'
process.env.ENABLE_LOCAL_WORKER_COMMANDS ||= 'true'

function arg(name, fallback) { const i = process.argv.indexOf(name); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback }

const campaignArg = arg('--campaign', 'latest')
const durationMinutes = Number(arg('--duration', '20'))
const maxFixtures = Number(arg('--max-fixtures', '2'))
const pollIntervalSeconds = Math.max(30, Number(arg('--poll', '45')))

const { createRepositories } = await import('../dist/repositories/index.js')
const runner = await import('../dist/modules/footballIntelligence/live/signalQuality/signalQualityCampaignRunner.service.js')
const worker = await import('../dist/modules/footballIntelligence/live/espnLiveFirstPersistentWorker.service.js')
const discovery = await import('../dist/modules/footballIntelligence/live/espnLiveFixtureDiscovery.service.js')
const review = await import('../dist/modules/footballIntelligence/live/signalQuality/liveFirstSignalQualityReview.service.js')

const repos = createRepositories()
const campaign = campaignArg === 'latest'
  ? await repos.intelligence.getLatestSignalQualityCampaign()
  : await repos.intelligence.getSignalQualityCampaign(campaignArg)
if (!campaign) { console.error('No campaign found. Create one first.'); process.exit(1) }

const label = `window_${new Date().toISOString()}`
const window = await runner.startCampaignWindow(campaign.id, label)
console.log(JSON.stringify({ campaignId: campaign.id, windowId: window.id, label }, null, 2))

// Check for live fixtures first; no live is not a failure.
const disc = await discovery.discoverLiveFixturesNow().catch(() => ({ selected: [] }))
if (!disc.selected || disc.selected.length === 0) {
  await runner.completeCampaignWindow(campaign.id, window.id, 'skipped_no_live_fixtures', { limitations: ['no_live_fixtures_found'] })
  console.log(JSON.stringify({ result: 'skipped_no_live_fixtures', note: 'not a failure' }, null, 2))
  process.exit(0)
}

const start = await worker.startWorkerRun({ mode: 'local_manual', maxDurationMinutes: durationMinutes, maxFixtures, pollIntervalSeconds })
const workerRunId = start.workerRunId || null
await runner.attachWorkerRunToWindow(window.id, campaign.id, { workerRunId, fixturesSelected: disc.selected.length })

const endAt = Date.now() + durationMinutes * 60 * 1000
while (Date.now() < endAt && workerRunId) {
  await new Promise(r => setTimeout(r, 60000))
}
if (workerRunId) await worker.stopWorkerRun(workerRunId).catch(() => {})

const summary = await review.saveSignalQualityReview().catch(() => null)
const derived = await runner.refreshCampaignDerivedArtifacts().catch(() => ({ humanReviewQueueSize: 0, readiness: 'not_ready_small_sample' }))
await runner.completeCampaignWindow(campaign.id, window.id, 'completed', {
  workerRunId,
  signalQualityCasesCreated: summary?.sampleSize ?? 0,
  signalQualityReviewId: summary?.id ?? null,
})

console.log(JSON.stringify({
  result: 'completed',
  workerRunId,
  sampleSize: summary?.sampleSize ?? 0,
  humanReviewQueueSize: derived.humanReviewQueueSize,
  thresholdStudyReadiness: derived.readiness,
}, null, 2))
process.exit(0)
