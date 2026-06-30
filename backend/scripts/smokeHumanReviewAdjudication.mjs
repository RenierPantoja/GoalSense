#!/usr/bin/env node
/** Smoke: Human Review Adjudication (B72) */
process.env.DATABASE_URL ||= 'file:./local.db'

let pass = 0, fail = 0
function record(ok, name, detail = '') {
  if (ok) { pass++; console.log(`[PASS] ${name}${detail ? ' - ' + detail : ''}`) }
  else { fail++; console.log(`[FAIL] ${name}${detail ? ' - ' + detail : ''}`) }
}

const adj = await import('../dist/modules/footballIntelligence/live/signalQuality/liveFirstHumanReviewAdjudication.service.js')
const v3 = await import('../dist/modules/footballIntelligence/live/signalQuality/thresholdReadinessV3.service.js')

function item(id, signalKind, priority, reason, evidenceSummary, limitations = []) {
  return { id, caseId: 'c_' + id, fixtureId: 'f_' + id, signalKind, reason, priority, suggestedReviewQuestion: 'Q?', evidenceSummary, limitations, status: 'pending', reviewerNotes: 'SECRET PRIVATE NOTE', createdAt: new Date().toISOString(), reviewedAt: null }
}

// 1. duplicate cluster -> duplicate_of_existing_pattern
const d1 = adj.decideConservativeAdjudication(item('1', 'pressure_shift', 'low', 'duplicate signal', 'evidence=weak, noise=high, alignment=pending, grade=noisy_monitor_only'), 'duplicate_cluster')
record(d1.decision === 'duplicate_of_existing_pattern', 'duplicate cluster -> duplicate_of_existing_pattern', d1.decision)

// 2. strong + aligned -> confirmed_useful_signal
const d2 = adj.decideConservativeAdjudication(item('2', 'score_shift', 'medium', 'aligned', 'evidence=strong, noise=low, alignment=aligned, grade=reliable_observe'), 'pattern_watch')
record(d2.decision === 'confirmed_useful_signal' && d2.conservativeDefaultApplied === false, 'strong+aligned -> confirmed_useful_signal', d2.decision)

// 3. missing critical context -> insufficient_evidence
const d3 = adj.decideConservativeAdjudication(item('3', 'possession_shift', 'medium', 'missing critical context', 'evidence=insufficient, noise=medium, alignment=pending', ['missing: possession stats']), 'insufficient_data_bucket')
record(d3.decision === 'insufficient_evidence', 'missing context -> insufficient_evidence', d3.decision)

// 4. clearly noise -> confirmed_noise
const d4 = adj.decideConservativeAdjudication(item('4', 'pressure_shift', 'medium', 'noise', 'evidence=weak, noise=high, alignment=contradicted, grade=noisy_monitor_only'), 'low_value_noise')
record(d4.decision === 'confirmed_noise', 'clearly noise -> confirmed_noise', d4.decision)

// 5. pattern_watch without strong evidence -> needs_more_samples (conservative default)
const d5 = adj.decideConservativeAdjudication(item('5', 'score_shift', 'medium', 'partially aligned', 'evidence=moderate, noise=low, alignment=partially_aligned, grade=useful_but_limited'), 'pattern_watch')
record(d5.decision === 'needs_more_samples' && d5.conservativeDefaultApplied === true, 'pattern_watch weak -> needs_more_samples', d5.decision)

// 6. summary built; byDecision counts add up; reviewerPrivateNotesExposed=false
const records = [d1, d2, d3, d4, d5].map((d, i) => ({
  id: 'r' + i, itemId: String(i + 1), caseId: 'c', fixtureId: 'f', signalKind: 'score_shift',
  bucket: null, decision: d.decision, rationale: d.rationale, reviewerNotesPrivate: 'SECRET PRIVATE NOTE',
  priorityBefore: 'medium', conservativeDefaultApplied: d.conservativeDefaultApplied, adjudicatedBy: 'system_conservative_default', runtimeImpact: 'none', createdAt: new Date().toISOString(),
}))
const summary = adj.buildAdjudicationSummary(records, 5, 0)
const sumOfDecisions = Object.values(summary.byDecision).reduce((s, n) => s + n, 0)
record(summary.totalAdjudicated === 5 && sumOfDecisions === 5, 'summary counts all adjudications', String(sumOfDecisions))

// 7. summary excludes reviewer private notes
record(!/SECRET PRIVATE NOTE|reviewerNotesPrivate/i.test(JSON.stringify(summary)), 'adjudication summary excludes private notes')
record(summary.reviewerPrivateNotesExposed === false, 'reviewerPrivateNotesExposed=false')

// 8. adjudication asserts no runtime/policy/score change
record(summary.limitations.some(l => /never changes policy, threshold, score, confidence, or runtime/i.test(l)), 'summary asserts observe-only (no runtime/policy/score/confidence change)')

// 9. readiness V3: small sample -> not_ready_small_sample
const r9 = v3.evaluateThresholdStudyReadinessV3({ cases: [], untriagedCriticalOrHighValue: 0, unadjudicatedRequiresReview: 0, reviewQueuePending: 0, reviewQueueAdjudicated: 0 })
record(r9.readiness === 'not_ready_small_sample', 'readiness V3 small sample -> not_ready_small_sample', r9.readiness)

// 10. readiness V3: enough sample but queue unadjudicated -> not_ready_review_queue_unadjudicated
const bigCases = new Array(220).fill(0).map((_, i) => ({ id: 'x' + i, fixtureId: 'f', sessionId: 's', signalKind: 'score_shift', signalTimestamp: '', source: 'scoreboard', evidenceStrength: 'strong', noiseRisk: 'low', outcomeAlignment: 'aligned', qualityGrade: 'reliable_observe', supportingEvidence: [], missingEvidence: [], limitations: [], createdAt: '' }))
const r10 = v3.evaluateThresholdStudyReadinessV3({ cases: bigCases, untriagedCriticalOrHighValue: 0, unadjudicatedRequiresReview: 3, reviewQueuePending: 3, reviewQueueAdjudicated: 0 })
record(r10.readiness === 'not_ready_review_queue_unadjudicated', 'readiness V3 unadjudicated -> not_ready_review_queue_unadjudicated', r10.readiness)

// 11. readiness V3 never changes runtime (flag)
record(r10.readiness !== undefined && !/odds|stake|probability|calibrat/i.test(JSON.stringify({ ...r9, ...r10 })), 'readiness V3 is observe-only, no forbidden terms')

console.log(`\nSmoke result: ${pass} passed, ${fail} failed.`)
process.exit(fail === 0 ? 0 : 1)
