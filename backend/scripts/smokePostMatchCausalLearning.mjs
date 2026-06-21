/**
 * Smoke — Post-Match Causal Learning (B48 / Bloco 5). PURE + Noop only.
 * ─────────────────────────────────────────────────────────────────────────────
 * Verifies offline: exact vs weak link; weak link never strong causality; unknown
 * outcome → not_evaluable; wait+failed → should_have_waited; block+failed →
 * should_have_stayed_out; block+good → overconservative; red-card evidence →
 * variance_or_shock; no shock evidence ≠ chance; missing domain → data insight; weak
 * sample → caution insight; calibration needs min sample; autoApply=false; Noop-safe.
 *
 * Build first: npm run build
 * Usage: node scripts/smokePostMatchCausalLearning.mjs
 */
const FAILURES = []
function assert(c, m) { if (!c) { FAILURES.push(m); console.log(`  [FAIL] ${m}`) } else console.log(`  [ok] ${m}`) }
async function load(p) { try { return await import(p) } catch (e) { console.error(`Could not import ${p}. Run \`npm run build\` first.`); console.error(e?.message || e); process.exit(1) } }

const linker = await load('../dist/modules/footballIntelligence/causal/decisionOutcomeLinker.service.js')
const cls = await load('../dist/modules/footballIntelligence/causal/causalOutcomeClassifier.service.js')
const insight = await load('../dist/modules/footballIntelligence/causal/causalInsightGenerator.service.js')
const calib = await load('../dist/modules/footballIntelligence/causal/calibrationSuggestion.service.js')

function input(over = {}) {
  return {
    outcomeResult: 'failed', governanceAction: 'allow_alert', wouldHaveBlocked: false, wouldHaveWaited: false,
    actualAlertCreated: true, linkStrength: 'exact', influenceBand: 'supportive', missingCriticalDomains: [], staleDomains: [],
    hasRedCardEvidence: false, hasSubstitutionEvidence: false, hasInjuryEvidence: false, hasLateGoalEvidence: false,
    weakSampleUsed: false, memoryMisleading: false, providerLimited: false, conflicts: [], ...over,
  }
}
function caseFrom(c) {
  return {
    id: c.id || 'clc_test', fixtureId: 'f1', patternId: 'pat_x', alertId: 'al_x', candidateAlertId: 'al_x', opportunityId: null,
    governanceResultId: 'agr_x', influenceLedgerId: null, signalLedgerId: null, outcomeId: 'out_x', source: 'alert',
    createdAt: new Date().toISOString(), evaluatedAt: new Date().toISOString(), outcomeResult: c.outcomeResult || 'failed',
    governanceAction: c.governanceAction || 'allow_alert', linkStrength: c.linkStrength || 'exact',
    classification: c.classification, successCategories: c.successCategories || [], failureCategories: c.failureCategories || [],
    decisionTimeline: [], evidenceRefs: [], dataQuality: 'partial', evaluable: c.evaluable !== false, limitations: [],
  }
}

console.log('[smoke] decision-outcome link strength:')
{
  const exact = linker.classifyLinkStrength({ governanceCandidateAlertId: 'al_x', alertId: 'al_x', samePattern: true, sameFixture: true })
  assert(exact.strength === 'exact', 'candidateAlertId===alertId → exact')
  const weak = linker.classifyLinkStrength({ alertId: 'al_x', samePattern: false, sameFixture: true })
  assert(weak.strength === 'weak_contextual', 'same fixture, no pattern → weak_contextual')
  const none = linker.classifyLinkStrength({ alertId: 'al_x', samePattern: false, sameFixture: false })
  assert(none.strength === 'unknown', 'no fixture → unknown')
}

console.log('[smoke] classification conservatism:')
{
  assert(cls.classifyCausalCase(input({ outcomeResult: 'unknown' })).classification === 'not_evaluable', 'unknown outcome → not_evaluable')
  assert(cls.classifyCausalCase(input({ outcomeResult: 'pending' })).classification === 'not_evaluable', 'pending outcome → not_evaluable')
  assert(cls.classifyCausalCase(input({ linkStrength: 'weak_contextual' })).classification === 'unknown', 'weak link → unknown (no strong causality)')

  const wait = cls.classifyCausalCase(input({ outcomeResult: 'failed', wouldHaveWaited: true, governanceAction: 'wait_for_lineup', actualAlertCreated: true }))
  assert(wait.classification === 'should_have_waited' && wait.failureCategories.includes('ignored_wait_reason'), 'wait + failed → should_have_waited / ignored_wait_reason')

  const block = cls.classifyCausalCase(input({ outcomeResult: 'failed', wouldHaveBlocked: true, governanceAction: 'block_alert', actualAlertCreated: true }))
  assert(block.classification === 'should_have_stayed_out' && block.failureCategories.includes('ignored_blocker'), 'block + failed → should_have_stayed_out / ignored_blocker')

  const over = cls.classifyCausalCase(input({ outcomeResult: 'confirmed', wouldHaveBlocked: true, governanceAction: 'block_alert' }))
  assert(over.classification === 'overconservative', 'block (shadow) + good outcome → overconservative')

  const shock = cls.classifyCausalCase(input({ outcomeResult: 'failed', hasRedCardEvidence: true }))
  assert(shock.classification === 'variance_or_shock' && shock.failureCategories.includes('red_card_shock'), 'red card evidence → variance_or_shock')

  const noShock = cls.classifyCausalCase(input({ outcomeResult: 'failed' }))
  assert(noShock.classification !== 'variance_or_shock', 'no shock evidence → NOT chance/variance')
  assert(noShock.limitations.some(l => /investigar|acaso/i.test(l)) || noShock.failureCategories.length > 0, 'no-shock failure → investigated, not auto-chance')

  const missing = cls.classifyCausalCase(input({ outcomeResult: 'failed', missingCriticalDomains: ['injuries'], providerLimited: true }))
  assert(missing.classification === 'provider_limited' && missing.failureCategories.includes('missing_critical_domain'), 'missing domain → provider_limited / missing_critical_domain')
}

console.log('[smoke] insights require evidence + advisory only:')
{
  const dataCase = caseFrom({ classification: 'provider_limited', failureCategories: ['missing_critical_domain', 'provider_limitation'] })
  const dataInsights = insight.generateInsightsForCase(dataCase)
  assert(dataInsights.some(i => i.insightType === 'data_acquisition'), 'missing domain case → data_acquisition insight')
  assert(dataInsights.every(i => i.autoApplicable === false && i.requiresHumanReview === true), 'all insights autoApplicable=false, requiresHumanReview=true')

  const memCase = caseFrom({ classification: 'bad_decision_bad_outcome', failureCategories: ['weak_sample_overweighted', 'memory_misleading'] })
  const memInsights = insight.generateInsightsForCase(memCase)
  assert(memInsights.some(i => i.insightType === 'memory'), 'weak sample/memory case → memory insight')

  const notEval = caseFrom({ classification: 'not_evaluable', evaluable: false })
  assert(insight.generateInsightsForCase(notEval).length === 0, 'not_evaluable case → no insights')
}

console.log('[smoke] calibration needs min sample + never auto-applies:')
{
  const few = [caseFrom({ classification: 'overconservative', failureCategories: ['governance_too_strict'] })]
  assert(calib.suggestGovernancePolicyRefinements(few).length === 0, '1 case → no suggestion (min sample)')
  const many = Array.from({ length: 5 }, () => caseFrom({ classification: 'overconservative', failureCategories: ['governance_too_strict'] }))
  const sugg = calib.suggestGovernancePolicyRefinements(many)
  assert(sugg.length >= 1, '5 cases → suggestion emitted')
  assert(sugg.every(s => s.autoApplyAllowed === false && s.reviewStatus === 'pending'), 'suggestions autoApplyAllowed=false, pending review')
  assert(sugg[0].confidenceOfSuggestion === 'low', '5 cases → low confidence (insufficient for medium/high)')

  const overInf = Array.from({ length: 4 }, () => caseFrom({ classification: 'bad_decision_bad_outcome', failureCategories: ['influence_overestimated'] }))
  const infSugg = calib.suggestVariableInfluenceRefinements(overInf)
  assert(infSugg.length >= 1 && infSugg[0].autoApplyAllowed === false, 'influence suggestion emitted, autoApply=false')
}

console.log('[smoke] Noop repo safe — causal reads empty, accept does not persist:')
{
  const { NoopIntelligenceRepository } = await load('../dist/repositories/noopIntelligence.repository.js')
  const repo = new NoopIntelligenceRepository()
  const c = { id: 'clc_x', fixtureId: 'f1' }
  assert((await repo.saveCausalLearningCase(c)).id === 'clc_x', 'Noop saves causal case (returns input)')
  assert((await repo.getCausalLearningCase('clc_x')) === null, 'Noop get causal case → null')
  assert((await repo.listCausalLearningCases()).length === 0, 'Noop list cases → []')
  assert((await repo.listCausalLearningInsights()).length === 0, 'Noop list insights → []')
  assert((await repo.listGovernanceCalibrationSuggestions()).length === 0, 'Noop list gov suggestions → []')
  assert((await repo.updateGovernanceCalibrationSuggestion('gcs_x', { reviewStatus: 'accepted_for_future' })).count === 0, 'Noop accept → count 0 (does not persist/apply runtime)')
  const run = { id: 'clr_x', scope: 'fixture' }
  assert((await repo.createCausalLearningRun(run)).id === 'clr_x', 'Noop create causal run')
  assert((await repo.listCausalLearningRuns()).length === 0, 'Noop list runs → []')
}

if (FAILURES.length > 0) { console.log(`[smoke] FAILED (${FAILURES.length}): ${FAILURES.join(' | ')}`); process.exitCode = 1 }
else console.log('[smoke] OK')
