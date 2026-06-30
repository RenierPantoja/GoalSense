#!/usr/bin/env node
/** Smoke: Signal Quality Campaign + Human Review + Baseline (B70) */
process.env.DATABASE_URL ||= 'file:./local.db'

let pass = 0, fail = 0
function record(ok, name, detail = '') {
  if (ok) { pass++; console.log(`[PASS] ${name}${detail ? ' - ' + detail : ''}`) }
  else { fail++; console.log(`[FAIL] ${name}${detail ? ' - ' + detail : ''}`) }
}

const runner = await import('../dist/modules/footballIntelligence/live/signalQuality/signalQualityCampaignRunner.service.js')
const hrq = await import('../dist/modules/footballIntelligence/live/signalQuality/liveFirstHumanReviewQueue.service.js')
const baselineSvc = await import('../dist/modules/footballIntelligence/live/signalQuality/liveFirstSignalReliabilityBaseline.service.js')
const publicModel = await import('../dist/modules/controlPlane/controlPlanePublicReadModel.service.js')

// 1. campaign created
const campaign = await runner.createSignalQualityCampaign({ name: 'Smoke Campaign', targetWindows: 5, targetMinimumCases: 150 })
record(!!campaign.id && campaign.status === 'running', 'campaign created', campaign.id)

// 2. window attached
const window = await runner.startCampaignWindow(campaign.id, 'smoke_window')
record(window.campaignId === campaign.id && window.status === 'running', 'window attached')

// 3. no_live_fixtures is not failed
await runner.completeCampaignWindow(campaign.id, window.id, 'skipped_no_live_fixtures', { limitations: ['no_live_fixtures_found'] })
const summaryAfterSkip = await runner.buildCampaignSummary(campaign.id)
record(!!summaryAfterSkip && summaryAfterSkip.windowsCompleted >= 1, 'no_live_fixtures not failed (window counted)')

// 4. human review queue built from synthetic cases
const cases = [
  { id: 'c1', fixtureId: 'f1', sessionId: 's1', signalKind: 'pressure_shift', qualityGrade: 'misleading_candidate', evidenceStrength: 'moderate', noiseRisk: 'high', outcomeAlignment: 'contradicted', missingEvidence: [], limitations: [], supportingEvidence: [], source: 'derived', signalTimestamp: new Date().toISOString(), createdAt: new Date().toISOString() },
  { id: 'c2', fixtureId: 'f2', sessionId: 's1', signalKind: 'score_shift', qualityGrade: 'reliable_observe', evidenceStrength: 'strong', noiseRisk: 'low', outcomeAlignment: 'aligned', missingEvidence: [], limitations: [], supportingEvidence: [], source: 'scoreboard', signalTimestamp: new Date().toISOString(), createdAt: new Date().toISOString() },
]
const items = hrq.buildHumanReviewItems(cases)
record(items.length === 1 && items[0].priority === 'critical', 'human review queue picks misleading_candidate only', String(items.length))

// 5. baseline is not a probability
const baseline = baselineSvc.buildReliabilityBaseline(cases, items.length)
record(/observational/i.test(baseline.consistencyNote) && !/odds|stake|"accuracy":/i.test(JSON.stringify(baseline)), 'baseline is not a probability (observational disclaimer, no odds/accuracy values)')

// 6. threshold readiness not_ready with small sample
record(baseline.thresholdStudyReadiness === 'not_ready_small_sample', 'threshold readiness not_ready (small sample)', baseline.thresholdStudyReadiness)

// 7. missing data is ratio, not zero outcome
record(typeof baseline.missingStatsRatio === 'number' && typeof baseline.notEvaluableRatio === 'number', 'missing data reported as ratio')

// 8. public summary sanitized: no reviewer notes / raw payload
const campaignPublic = await publicModel.buildPublicSignalQualityCampaignSummary()
const pubSerialized = JSON.stringify(campaignPublic)
record(!/reviewerNotes|rawPayload|statsJson|eventsJson|AIza|BEGIN PRIVATE/i.test(pubSerialized), 'public campaign summary has no reviewer notes / raw payload / secrets')

// 9. public summary observe-only
record(campaignPublic.campaign.observeOnly === true && campaignPublic.humanReview.observeOnly === true, 'public campaign summary observe-only')

// 10. human review public preview has no notes field
const hasNotes = (campaignPublic.humanReview.items || []).some(i => 'reviewerNotes' in i)
record(!hasNotes, 'human review public preview excludes reviewer notes')

// 11. no odds / probability anywhere in public campaign
record(!/odds|probability|stake/i.test(pubSerialized), 'no odds/probability/stake in public campaign')

console.log(`\nSmoke result: ${pass} passed, ${fail} failed.`)
process.exit(fail === 0 ? 0 : 1)
