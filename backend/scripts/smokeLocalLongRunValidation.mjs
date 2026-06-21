/**
 * Smoke — Local Long-Run Validation (B49 / Bloco 6). PURE + Noop only.
 * ─────────────────────────────────────────────────────────────────────────────
 * Verifies offline: cost estimate does not call provider; metrics separate unknown/
 * not_evaluable/failed and provider-limitation from failure; cache hit/miss counts;
 * live recheck bridge OFF by default + never alerts; link repair never weak→exact;
 * go/no-go without provider/long history is NOT beta_candidate; default mode shadow_only;
 * Noop-safe; Firebase-only persistence declared honestly.
 *
 * Build first: npm run build
 * Usage: node scripts/smokeLocalLongRunValidation.mjs
 */
const FAILURES = []
function assert(c, m) { if (!c) { FAILURES.push(m); console.log(`  [FAIL] ${m}`) } else console.log(`  [ok] ${m}`) }
async function load(p) { try { return await import(p) } catch (e) { console.error(`Could not import ${p}. Run \`npm run build\` first.`); console.error(e?.message || e); process.exit(1) } }

const plan = await load('../dist/modules/footballIntelligence/validation/localValidationPlan.service.js')
const metrics = await load('../dist/modules/footballIntelligence/validation/localValidationMetrics.service.js')
const bridge = await load('../dist/modules/footballIntelligence/validation/localLiveReevaluationBridge.service.js')
const cov = await load('../dist/modules/footballIntelligence/validation/providerCoverageReport.service.js')
const linker = await load('../dist/modules/footballIntelligence/causal/decisionOutcomeLinker.service.js')
const cache = await load('../dist/modules/footballIntelligence/validation/localValidationCache.service.js')

function summary(over = {}) {
  return {
    id: 'lvfs_x', runId: 'run1', fixtureId: 'f1', teams: 'A x B', competition: 'L', status: 'FT', kickoffTime: null,
    selected: true, skipReason: null, preMatchAcquired: false, liveMonitored: false, postMatchResolved: true,
    packageBuilt: true, memoryBuilt: false, influenceBuilt: true, governanceEvaluated: true, causalEvaluated: true,
    dataQuality: 'partial', providerLimitations: [], manualDataUsed: false, notEvaluableReasons: [], createdAt: new Date().toISOString(), ...over,
  }
}

console.log('[smoke] cost estimate does not call provider:')
{
  const fakePlan = { date: 'x', mode: 'shadow_only', totalFixturesKnown: 3, fixtures: [], selectedCount: 3, skippedCount: 0, estimatedProviderCalls: 0, estimatedFirebaseReads: 36, estimatedFirebaseWrites: 18, risks: [], limitations: [] }
  const c = plan.estimateValidationCost(fakePlan)
  assert(c.reads === 36 && c.writes === 18, 'cost estimate reads from plan (no provider call)')
  assert(typeof plan.isLocalValidationEnabled() === 'boolean', 'isLocalValidationEnabled returns boolean')
}

console.log('[smoke] coverage/cost/go-no-go separate failure from limitation:')
{
  const summaries = [summary(), summary({ providerLimitations: ['injuries'], dataQuality: 'poor' }), summary({ notEvaluableReasons: ['vínculo fraco'], dataQuality: 'unknown', packageBuilt: false })]
  const coverage = metrics.buildCoverageMetrics('run1', summaries)
  assert(coverage.evidenceCoverage >= 0 && coverage.evidenceCoverage <= 100, 'coverage percentages bounded')

  const cost = metrics.buildCostMetrics('run1', summaries, { hits: 5, misses: 2 }, 1000)
  assert(cost.cacheHits === 5 && cost.cacheMisses === 2, 'cost metrics carry cache hit/miss')
  assert(cost.providerCalls === 0, 'cost metrics provider calls = 0 (no calls in validation core)')

  const reliability = { runId: 'run1', fixturesAnalyzed: 0, fixturesWithSufficientData: 0, fixturesProviderLimited: 1, causalCasesEvaluable: 0 }
  const gng0 = metrics.buildGoNoGoReport('run1', reliability, summaries)
  assert(gng0.localBackendStatus === 'insufficient_data', '0 fixtures analyzed → insufficient_data')
  assert(gng0.commercialReadiness !== 'beta_candidate', 'never beta_candidate without provider + long history')
  assert(gng0.reasons.some(r => /beta_candidate/i.test(r)), 'go/no-go states beta_candidate requires provider+firebase+history')

  const reliability2 = { runId: 'run1', fixturesAnalyzed: 3, fixturesWithSufficientData: 2, fixturesProviderLimited: 1, causalCasesEvaluable: 1 }
  const gng = metrics.buildGoNoGoReport('run1', reliability2, summaries)
  assert(gng.localBackendStatus === 'go' || gng.localBackendStatus === 'go_with_warnings', 'analyzed with data → go/go_with_warnings')
  assert(gng.commercialReadiness !== 'beta_candidate', 'still not beta_candidate (history < 25 evaluable / provider gates)')
}

console.log('[smoke] live recheck bridge OFF by default + pure trigger detection:')
{
  assert(bridge.isBridgeEnabled() === false, 'live recheck bridge OFF by default')
  const triggers = bridge.detectRelevantLiveTriggers({ fixtureId: 'f1', status: '2H', scoreHome: 1, scoreAway: 0 }, { status: '2H', scoreHome: 0, scoreAway: 0 })
  assert(triggers.includes('goal'), 'score increase → goal trigger')
  const st = bridge.detectRelevantLiveTriggers({ fixtureId: 'f1', status: 'HT', scoreHome: 0, scoreAway: 0 }, { status: '1H', scoreHome: 0, scoreAway: 0 })
  assert(st.includes('half_time') && st.includes('match_status_changed'), 'status 1H→HT → half_time + match_status_changed')
  // OFF bridge does not enqueue.
  assert(bridge.enqueueGovernanceRecheck('f1', 'goal') === false, 'OFF bridge does not enqueue (never alerts)')
  const status = bridge.explainLiveRecheckBridgeStatus()
  assert(status.enabled === false, 'bridge status reports disabled')
}

console.log('[smoke] link repair never promotes weak→exact:')
{
  const exact = linker.classifyLinkStrength({ governanceCandidateAlertId: 'al', alertId: 'al', samePattern: true, sameFixture: true })
  assert(exact.strength === 'exact', 'real id match → exact')
  const weak = linker.classifyLinkStrength({ alertId: 'al', samePattern: false, sameFixture: true })
  assert(weak.strength !== 'exact', 'no id match → never exact')
  const temporal = linker.classifyLinkStrength({ alertId: 'al', samePattern: true, sameFixture: true, closeInTimeMs: 1000 })
  assert(temporal.strength === 'strong_contextual' || temporal.strength === 'temporal_contextual', 'same fixture+pattern close → contextual (not exact)')
}

console.log('[smoke] provider coverage report (pure, no calls):')
{
  const r = cov.buildProviderCoverageReport()
  assert(Array.isArray(r.domainsCovered) && Array.isArray(r.domainsBlockedByEnv), 'coverage report has domain arrays')
  assert(r.limitations.some(l => /limitação/i.test(l)), 'coverage report flags limitation ≠ failure')
}

console.log('[smoke] cache hit/miss counters:')
{
  const c = cache.getRunCache('run_test')
  assert(c.hits === 0 && c.misses === 0, 'new run cache starts at 0/0')
  const m = cache.getCacheMetrics('run_test')
  assert(m.hits === 0 && m.misses === 0, 'getCacheMetrics returns counters')
  cache.clearRunCache('run_test')
  assert(cache.getCacheMetrics('run_test').hits === 0, 'clearRunCache resets')
}

console.log('[smoke] Noop repo safe — validation reads empty (Firebase-only persistence):')
{
  const { NoopIntelligenceRepository } = await load('../dist/repositories/noopIntelligence.repository.js')
  const repo = new NoopIntelligenceRepository()
  const run = { id: 'lvr_x', mode: 'shadow_only' }
  assert((await repo.saveLocalValidationRun(run)).id === 'lvr_x', 'Noop saves validation run (returns input)')
  assert((await repo.getLocalValidationRun('lvr_x')) === null, 'Noop get run → null (insufficient_data)')
  assert((await repo.listLocalValidationRuns()).length === 0, 'Noop list runs → []')
  assert((await repo.listLocalValidationFixtureSummaries('lvr_x')).length === 0, 'Noop list fixture summaries → []')
  assert((await repo.getLocalValidationReliabilityMetrics('lvr_x')) === null, 'Noop reliability → null')
  assert((await repo.getLocalValidationGoNoGoReport('lvr_x')) === null, 'Noop go/no-go → null')
  assert((await repo.getBackendHealthReport('x')) === null, 'Noop backend health → null')
}

if (FAILURES.length > 0) { console.log(`[smoke] FAILED (${FAILURES.length}): ${FAILURES.join(' | ')}`); process.exitCode = 1 }
else console.log('[smoke] OK')
