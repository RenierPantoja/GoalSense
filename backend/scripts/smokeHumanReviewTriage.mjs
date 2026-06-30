#!/usr/bin/env node
/** Smoke: Human Review Triage (B71) */
process.env.DATABASE_URL ||= 'file:./local.db'

let pass = 0, fail = 0
function record(ok, name, detail = '') {
  if (ok) { pass++; console.log(`[PASS] ${name}${detail ? ' - ' + detail : ''}`) }
  else { fail++; console.log(`[FAIL] ${name}${detail ? ' - ' + detail : ''}`) }
}

const triage = await import('../dist/modules/footballIntelligence/live/signalQuality/liveFirstHumanReviewTriage.service.js')
const baseline = await import('../dist/modules/footballIntelligence/live/signalQuality/liveFirstSignalReliabilityBaseline.service.js')

function item(id, fixtureId, signalKind, priority, reason, evidenceSummary, limitations = []) {
  return { id, caseId: 'c_' + id, fixtureId, signalKind, reason, priority, suggestedReviewQuestion: 'Q?', evidenceSummary, limitations, status: 'pending', reviewerNotes: 'SECRET NOTE', createdAt: new Date().toISOString(), reviewedAt: null }
}

const items = [
  item('1', 'f1', 'pressure_shift', 'critical', 'Graded misleading_candidate (contradicted with non-trivial evidence).', 'evidence=moderate, noise=high, alignment=contradicted, grade=misleading_candidate'),
  item('2', 'f2', 'pressure_shift', 'medium', 'High noise risk; verify before trusting.', 'evidence=weak, noise=high, alignment=pending, grade=noisy_monitor_only'),
  item('3', 'f3', 'possession_shift', 'medium', 'Useful but limited with missing critical context.', 'evidence=insufficient, noise=medium, alignment=pending', ['missing: possession stats not available']),
  item('4', 'f3', 'possession_shift', 'medium', 'Useful but limited with missing critical context.', 'evidence=insufficient, noise=medium, alignment=pending', ['missing: possession stats not available']),
  item('5', 'f5', 'score_shift', 'high', 'Alert-candidate posture with weak/insufficient evidence.', 'evidence=weak, noise=low, alignment=aligned'),
]

const results = triage.triageHumanReviewQueue(items)

// 1. contradicted strong/critical -> critical_review
record(results.find(r => r.itemId === '1')?.bucket === 'critical_review', 'contradicted/critical -> critical_review')

// 2. high priority weak alert candidate -> high_value_review
record(results.find(r => r.itemId === '5')?.bucket === 'high_value_review', 'weak alert candidate -> high_value_review')

// 3. duplicates (items 3 & 4 same fixture+kind+reason) -> one becomes duplicate_cluster
const dup = results.filter(r => r.bucket === 'duplicate_cluster')
record(dup.length === 1, 'duplicates grouped into duplicate_cluster', String(dup.length))

// 4. missing stats -> insufficient_data_bucket (item 3, the first non-dup)
record(results.find(r => r.itemId === '3')?.bucket === 'insufficient_data_bucket', 'missing stats -> insufficient_data_bucket', results.find(r => r.itemId === '3')?.bucket)

// 5. pending outcome not failed (no throw, classified)
record(results.every(r => !!r.bucket), 'pending outcome not failed (all classified)')

// 6. triage does not change policy/threshold/score (results carry limitation note)
record(results.every(r => r.limitations.some(l => /no policy\/threshold\/score/i.test(l))), 'triage limitation states no policy/threshold/score change')

// 7. summary built; critical never disappears
const summary = triage.buildHumanReviewTriageSummary(results)
record(summary.criticalReview >= 1 && summary.totalItems === items.length, 'summary keeps critical, counts all items')

// 8. suggested batch / summary has NO reviewer notes
record(!/SECRET NOTE|reviewerNotes/i.test(JSON.stringify(summary)), 'triage summary excludes reviewer notes')

// 9. readiness v2 not_ready when critical/high-value untriaged
const v2 = baseline.evaluateThresholdStudyReadinessV2({ cases: new Array(120).fill(0).map((_, i) => ({ id: 'x' + i, fixtureId: 'f', sessionId: 's', signalKind: 'score_shift', signalTimestamp: '', source: 'scoreboard', evidenceStrength: 'strong', noiseRisk: 'low', outcomeAlignment: 'aligned', qualityGrade: 'reliable_observe', supportingEvidence: [], missingEvidence: [], limitations: [], createdAt: '' })), untriagedCriticalOrHighValue: 3 })
record(v2.readiness === 'not_ready_review_queue_untriaged', 'readiness v2 not_ready when critical untriaged', v2.readiness)

// 10. baseline is not a probability
const b = baseline.buildReliabilityBaseline([], 0)
record(/observational/i.test(b.consistencyNote) && !/odds|stake|"accuracy":/i.test(JSON.stringify(b)), 'baseline is not a probability')

console.log(`\nSmoke result: ${pass} passed, ${fail} failed.`)
process.exit(fail === 0 ? 0 : 1)
