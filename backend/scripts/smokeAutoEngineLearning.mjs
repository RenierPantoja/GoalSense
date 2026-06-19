/**
 * Smoke test — Auto Engine Learning & Calibration (Phase B24). PURE, no env/network.
 * ─────────────────────────────────────────────────────────────────────────────
 * Imports ONLY env-free modules (pure calibration builder, stats util, Noop repo).
 * Never imports the aggregator/calibration services (which load env).
 *
 * Asserts:
 *   - unknown never counts as failed; confirmed_partial counts as partial-useful
 *   - score buckets are assigned correctly
 *   - insufficient sample blocks strong recommendations (low strength only)
 *   - high unknown produces a cautious recommendation
 *   - data quality "poor" policy limitation is always present
 *   - empty input → honest empty profile with limitations, no crash
 *   - Noop B24 methods return empty / accept writes without throwing
 *   - opportunity score is never rewritten (avgScore reflects input, not mutation)
 *
 * Build first: npm run build
 * Usage: node scripts/smokeAutoEngineLearning.mjs
 */
function assert(cond, msg) {
  if (!cond) { console.error(`  ✗ ${msg}`); process.exitCode = 1 }
  else console.log(`  ✓ ${msg}`)
}
async function load(path) {
  try { return await import(path) }
  catch (e) { console.error(`Could not import ${path}. Run \`npm run build\` first.`); console.error(e?.message || e); process.exit(1) }
}

const cal = await load('../dist/modules/intelligence/autoEngine/utils/autoEngineCalibration.util.js')
const noop = await load('../dist/repositories/noopIntelligence.repository.js')

const mk = (over) => ({
  opportunityId: 'o' + Math.random().toString(36).slice(2, 7),
  opportunityType: 'late_goal_pressure', score: 70, originalScore: 70,
  confidenceBand: 'medium', league: 'Serie A', homeTeam: 'A', awayTeam: 'B',
  minute: 80, dataQuality: 'partial', warnings: [], result: 'confirmed',
  timeToResolutionMinutes: 7, unknownReason: null, ...over,
})

console.log('[smoke] score bucket assignment:')
{
  assert(cal.scoreBucketOf(0) === '0-20', '0 → 0-20')
  assert(cal.scoreBucketOf(20) === '0-20', '20 → 0-20')
  assert(cal.scoreBucketOf(21) === '21-40', '21 → 21-40')
  assert(cal.scoreBucketOf(60) === '41-60', '60 → 41-60')
  assert(cal.scoreBucketOf(61) === '61-80', '61 → 61-80')
  assert(cal.scoreBucketOf(100) === '81-100', '100 → 81-100')
  assert(cal.scoreBucketOf(150) === '81-100', 'clamps above 100')
}

console.log('[smoke] strength gated by sample quality:')
{
  assert(cal.strengthFromSample('insufficient') === 'low', 'insufficient → low')
  assert(cal.strengthFromSample('low') === 'low', 'low → low')
  assert(cal.strengthFromSample('moderate') === 'medium', 'moderate → medium')
  assert(cal.strengthFromSample('strong') === 'high', 'strong → high')
}

console.log('[smoke] empty input → honest empty profile:')
{
  const p = cal.buildAutoEngineLearningProfile({ id: 'aelp_x', generatedAt: '2026-01-01T00:00:00.000Z', joined: [], promotedAlertsTotal: 0, blockedReasonCounts: {} })
  assert(p.sampleSize === 0 && p.usefulRate === null, 'empty → sampleSize 0, usefulRate null')
  assert(p.sampleQuality === 'insufficient', 'empty → insufficient')
  assert(p.limitations.some(l => l.includes('vazio')), 'empty → honest limitation present')
  assert(p.scoreCalibration.buckets.length === 5, 'always 5 score buckets')
}

console.log('[smoke] unknown is not failed; partial is partial-useful:')
{
  // 6 confirmed_partial + 6 unknown for one type → useful from partials, unknown separate.
  const joined = []
  for (let i = 0; i < 6; i++) joined.push(mk({ result: 'confirmed_partial' }))
  for (let i = 0; i < 6; i++) joined.push(mk({ result: 'unknown', unknownReason: 'sem dados pós-promoção' }))
  const p = cal.buildAutoEngineLearningProfile({ id: 'aelp_y', generatedAt: '2026-01-01T00:00:00.000Z', joined, promotedAlertsTotal: 12, blockedReasonCounts: {} })
  const t = p.opportunityTypeProfiles.find(x => x.opportunityType === 'late_goal_pressure')
  assert(t.confirmedPartial === 6 && t.failed === 0, 'partials counted, failed stays 0 (unknown ≠ failed)')
  assert(Math.abs(t.usefulRate - 0.5) < 0.001, 'usefulRate = partials/resolved = 0.5')
  assert(Math.abs(t.unknownRate - 0.5) < 0.001, 'unknownRate = unknown/resolved = 0.5')
  assert(t.failedRate === 0, 'failedRate 0 (no failed)')
  assert(p.recommendations.some(r => r.type === 'opportunity_type_high_unknown'), 'high unknown → cautious recommendation')
  assert(t.avgScore === 70, 'avgScore reflects input score (never rewritten)')
}

console.log('[smoke] insufficient sample blocks strong recommendation:')
{
  const joined = [mk({ result: 'confirmed' }), mk({ result: 'confirmed' })] // 2 resolved → insufficient
  const p = cal.buildAutoEngineLearningProfile({ id: 'aelp_z', generatedAt: '2026-01-01T00:00:00.000Z', joined, promotedAlertsTotal: 2, blockedReasonCounts: {} })
  const t = p.opportunityTypeProfiles[0]
  assert(t.sampleQuality === 'insufficient', 'small sample → insufficient')
  assert(t.recommendationStrength === 'low', 'insufficient → recommendationStrength low')
  assert(p.recommendations.some(r => r.type === 'insufficient_sample' && r.strength === 'low'), 'insufficient_sample rec emitted at low strength')
  assert(!p.recommendations.some(r => r.type === 'opportunity_type_positive_signal'), 'no positive-signal rec on insufficient sample')
}

console.log('[smoke] data quality poor policy + risk gate observation:')
{
  const p = cal.buildAutoEngineLearningProfile({ id: 'aelp_w', generatedAt: '2026-01-01T00:00:00.000Z', joined: [mk()], promotedAlertsTotal: 1, blockedReasonCounts: { data_poor: 4, score_below_minimum: 2 } })
  assert(p.recommendations.some(r => r.type === 'data_quality_limitation' && /poor/.test(r.message)), 'poor-data limitation always present')
  const gate = p.riskGateProfile.find(g => g.blockReason === 'data_poor')
  assert(gate && gate.interpretation === 'useful_blocker', 'data_poor block → useful_blocker')
  const gate2 = p.riskGateProfile.find(g => g.blockReason === 'score_below_minimum')
  assert(gate2 && gate2.interpretation === 'insufficient_sample', 'non-data block → insufficient_sample (no outcome to judge)')
  assert(p.riskGateProfile.every(g => g.laterPromotedCount === 0), 'blocked opps never promoted → laterPromotedCount 0')
}

console.log('[smoke] Noop B24 safety (prisma fallback):')
{
  const repo = new noop.NoopIntelligenceRepository()
  assert((await repo.getLatestAutoEngineLearningProfile()) === null, 'Noop getLatestAutoEngineLearningProfile → null')
  assert(Array.isArray(await repo.listAutoEngineLearningRuns()), 'Noop listAutoEngineLearningRuns → []')
  assert((await repo.getAutoEngineLearningRun('x')) === null, 'Noop getAutoEngineLearningRun → null')
  assert((await repo.getAutoOpportunityTypeProfile('late_goal_pressure')) === null, 'Noop getAutoOpportunityTypeProfile → null')
  assert(Array.isArray(await repo.listAutoEngineLearningRecommendations()), 'Noop listAutoEngineLearningRecommendations → []')
  const run = { id: 'aelr_x', startedAt: '', finishedAt: null, status: 'completed', source: 'auto_engine_promoted_alerts', outcomeSummariesScanned: 0, outcomeLinksScanned: 0, opportunitiesJoined: 0, sampleSize: 0, profileGenerated: false, recommendations: 0, learningEventsCreated: 0, dryRun: false, notes: [] }
  assert((await repo.createAutoEngineLearningRun(run)) === run, 'Noop createAutoEngineLearningRun accepts write without throwing')
}

if (process.exitCode === 1) console.error('[smoke] FAILED')
else console.log('[smoke] OK')
