#!/usr/bin/env node
/**
 * Smoke: Live-First Signal Quality Review (B68)
 * ─────────────────────────────────────────────────────────────────────────────
 * Validates evidence grading, momentum noise filtering, governance feedback, and
 * summary generation. Observe only — no odds, no probability, no calibration.
 */
process.env.DATABASE_URL ||= 'file:./local.db'

let pass = 0, fail = 0
function record(ok, name, detail = '') {
  if (ok) { pass++; console.log(`[PASS] ${name}${detail ? ' - ' + detail : ''}`) }
  else { fail++; console.log(`[FAIL] ${name}${detail ? ' - ' + detail : ''}`) }
}

const grading = await import('../dist/modules/footballIntelligence/live/signalQuality/liveFirstEvidenceGrading.service.js')
const noise = await import('../dist/modules/footballIntelligence/live/signalQuality/liveMomentumNoiseFilter.service.js')
const gov = await import('../dist/modules/footballIntelligence/live/signalQuality/liveFirstGovernanceQualityFeedback.service.js')
const review = await import('../dist/modules/footballIntelligence/live/signalQuality/liveFirstSignalQualityReview.service.js')

// 1. strong evidence for confirmed score_shift
const g1 = grading.gradeSignalEvidence('score_shift', { scoreChanged: true, freshness: 'fresh' })
record(g1.evidenceStrength === 'strong', 'evidence grading strong for confirmed score_shift', g1.evidenceStrength)

// 2. weak/insufficient for isolated pressure
const g2 = grading.gradeSignalEvidence('pressure_shift', { snapshotCount: 1, freshness: 'fresh' })
record(['weak', 'insufficient'].includes(g2.evidenceStrength), 'isolated pressure is weak/insufficient', g2.evidenceStrength)

// 3. missing stats not treated as zero -> recorded as missingEvidence
const g3 = grading.gradeSignalEvidence('possession_shift', { hasPossession: false, freshness: 'fresh' })
record(g3.missingEvidence.some(m => m.includes('possession')) && g3.evidenceStrength === 'insufficient', 'missing stats not treated as zero')

// 4. stale snapshot reduces evidence
const fresh = grading.gradeSignalEvidence('shots_shift', { hasShots: true, freshness: 'fresh' })
const stale = grading.gradeSignalEvidence('shots_shift', { hasShots: true, freshness: 'stale' })
record(stale.evidenceStrength !== fresh.evidenceStrength, 'stale snapshot reduces evidence', `${fresh.evidenceStrength}->${stale.evidenceStrength}`)

// 5. momentum noise detects single-snapshot spike
const n1 = noise.detectMomentumNoise({ snapshotCount: 1, hasStats: false, hasTimeline: false, freshness: 'fresh' })
record(n1.isLikelyNoise === true, 'single-snapshot spike flagged as noise', n1.category)

// 6. sustained pressure requires multiple points
const n2 = noise.detectMomentumNoise({ snapshotCount: 4, hasStats: true, freshness: 'fresh' })
record(n2.category === 'sustained_pressure' && n2.isLikelyNoise === false, 'sustained pressure recognized', n2.category)

// 7. governance feedback does not change policy (observe only) + recommends review
const fb = gov.evaluateGovernanceQuality({ fixtureId: 'f1', governanceAction: 'alert_candidate', evidenceStrength: 'weak', outcomeAlignment: 'aligned', hadMissingContext: false })
record(fb.feedback === 'too_aggressive' && fb.recommendation.includes('do NOT auto-calibrate'), 'governance feedback observe-only', fb.feedback)

// 8. quality review builds a summary
const cases = await review.buildSignalQualityCases()
const summary = review.buildSignalQualitySummary(cases)
record(typeof summary.sampleSize === 'number' && Array.isArray(summary.recommendations), 'quality review generates summary', `sample=${summary.sampleSize}`)

// 9. not_evaluable is not failed
const grade = review.deriveQualityGrade('moderate', 'medium', 'not_evaluable')
record(grade !== 'misleading_candidate' && grade === 'pending_more_sample', 'not_evaluable is not failed', grade)

// 10. no odds / probability / calibration in serialized summary
const serialized = JSON.stringify(summary)
record(!/odds|stake|probability|calibrat/i.test(serialized), 'no odds/probability/calibration in summary')

// 11. contradicted strong evidence -> misleading_candidate
const grade2 = review.deriveQualityGrade('strong', 'low', 'contradicted')
record(grade2 === 'misleading_candidate', 'contradicted strong evidence flagged misleading', grade2)

console.log(`\nSmoke result: ${pass} passed, ${fail} failed.`)
process.exit(fail === 0 ? 0 : 1)
