/**
 * Smoke test — Learning Aggregator (Phase B13). PURE, in-memory, no network.
 * ─────────────────────────────────────────────────────────────────────────────
 * Imports only env-free modules (utils, recommendation builder, Noop repo) so it
 * never triggers env/Firebase initialization. Creates NO alerts, NO data.
 *
 * Build first: npm run build
 * Usage: node scripts/smokeLearningAggregator.mjs
 */
function assert(cond, msg) {
  if (!cond) { console.error(`  ✗ ${msg}`); process.exitCode = 1 }
  else console.log(`  ✓ ${msg}`)
}

async function load(path) {
  try { return await import(path) }
  catch (e) { console.error(`Could not import ${path}. Run \`npm run build\` first.`); console.error(e?.message || e); process.exit(1) }
}

const mw = await load('../dist/modules/intelligence/learning/minuteWindow.util.js')
const ck = await load('../dist/modules/intelligence/learning/contextKey.util.js')
const st = await load('../dist/modules/intelligence/learning/learningStats.util.js')
const rec = await load('../dist/modules/intelligence/learning/learningRecommendation.service.js')
const noop = await load('../dist/repositories/noopIntelligence.repository.js')

console.log('[smoke] minute windows:')
assert(mw.minuteWindowOf(null) === 'unknown', 'null minute → unknown')
assert(mw.minuteWindowOf(10) === '0_15', 'minute 10 → 0_15')
assert(mw.minuteWindowOf(75) === '71_80', 'minute 75 → 71_80')
assert(mw.minuteWindowOf(95) === 'stoppage', 'minute 95 → stoppage')
assert(mw.minuteWindowOf(5, 'NS') === 'pre_match', 'NS status → pre_match')

console.log('[smoke] context keys:')
assert(ck.contextKey.pattern('p1') === 'pattern:p1', 'pattern key')
assert(ck.contextKey.competition('Série A') === 'competition:serie_a', 'competition key normalized (accents)')
assert(ck.contextKey.team('Atlético-MG') === 'team:atletico_mg', 'team key normalized')
assert(ck.scoreStateLabel({ home: 1, away: 1 }) === 'tied', 'score state tied')

console.log('[smoke] outcome distribution + rates:')
const d = st.newDistribution()
for (const r of ['confirmed', 'confirmed_partial', 'confirmed', 'failed', 'unknown', 'pending']) st.addResult(d, r)
assert(d.total === 6 && d.pending === 1, 'distribution counts total/pending')
assert(st.resolvedCount(d) === 5, 'resolved excludes pending (5)')
assert(st.usefulCount(d) === 3, 'usefulCount = confirmed + confirmed_partial (3)')
assert(st.usefulRate(d) === 0.6, 'usefulRate = 3/5 = 0.6')
assert(st.failedRate(d) === 0.2, 'failedRate = failed/resolved = 0.2 (unknown NOT included)')
assert(st.unknownRate(d) === 0.2, 'unknownRate explicit = 0.2')

console.log('[smoke] sample quality gate:')
assert(st.sampleQualityOf(3) === 'insufficient', '3 → insufficient')
assert(st.sampleQualityOf(10) === 'low', '10 → low')
assert(st.sampleQualityOf(20) === 'moderate', '20 → moderate')
assert(st.sampleQualityOf(50) === 'strong', '50 → strong')
assert(rec.recommendationStrength('insufficient') === 'low' && rec.recommendationStrength('strong') === 'high', 'recommendation strength tracks sample quality')

console.log('[smoke] recommendation sample gate:')
function distLike(o) { return { total: o.sampleSize, pending: o.pendingCount, confirmed: o.confirmedCount, confirmedPartial: o.confirmedPartialCount, failed: o.failedCount, unknown: o.unknownCount, expired: o.expiredCount } }
const insufficient = { id: 'plp_p1', scopeType: 'pattern', scopeKey: 'p1', label: 'Radar X', radarName: 'Radar X', sampleSize: 3, resolvedCount: 3, usefulCount: 1, confirmedCount: 1, confirmedPartialCount: 0, failedCount: 1, unknownCount: 1, pendingCount: 0, expiredCount: 0, usefulRate: 0.33, failedRate: 0.33, unknownRate: 0.33, avgConfidenceAtSignal: 60, avgTimeToResolutionMinutes: 8, dataQualityBreakdown: {}, sampleQuality: 'insufficient', source: 'observed', lastUpdatedAt: new Date().toISOString(), bestCompetitions: [], worstCompetitions: [], bestMinuteWindows: [], worstMinuteWindows: [], topFailureReasons: [] }
const recsInsufficient = rec.recommendationsForPattern(insufficient)
assert(recsInsufficient.length === 1 && recsInsufficient[0].type === 'insufficient_sample', 'insufficient sample → only insufficient_sample rec')

const moderate = { ...insufficient, sampleSize: 30, resolvedCount: 30, usefulCount: 12, confirmedCount: 10, confirmedPartialCount: 2, failedCount: 4, unknownCount: 14, pendingCount: 0, expiredCount: 0, usefulRate: 0.4, failedRate: 0.13, unknownRate: 0.46, sampleQuality: 'moderate',
  bestMinuteWindows: [{ contextKey: 'minute_window:71_80', label: "71'–80'", sampleSize: 12, usefulRate: 0.7, failedRate: 0.1, unknownRate: 0.2, sampleQuality: 'low' }],
  worstCompetitions: [{ contextKey: 'competition:amistoso', label: 'Amistoso', sampleSize: 8, usefulRate: 0.1, failedRate: 0.6, unknownRate: 0.3, sampleQuality: 'low' }] }
const recsModerate = rec.recommendationsForPattern(moderate)
const types = recsModerate.map(r => r.type)
assert(types.includes('high_unknown_rate'), 'moderate w/ unknownRate 0.46 → high_unknown_rate rec')
assert(types.includes('adjust_minute_window_candidate'), 'better minute window → adjust_minute_window_candidate rec')
assert(types.includes('exclude_context_candidate'), 'high-failure competition → exclude_context_candidate rec')
assert(recsModerate.every(r => r.evidence && typeof r.evidence.sampleSize === 'number'), 'every recommendation carries evidence')

console.log('[smoke] Noop adapter (prisma mode safety):')
const repo = new noop.NoopIntelligenceRepository()
const ov = await repo.getOverview()
assert(ov.ledgerEntries === 0 && ov.outcomes === 0, 'Noop overview is empty/honest')
assert((await repo.listSignalContextStats()).length === 0, 'Noop listSignalContextStats → []')
assert((await repo.listPatternLearningProfiles()).length === 0, 'Noop listPatternLearningProfiles → []')
assert((await repo.getLatestLearningAggregationRun()) === null, 'Noop latest run → null')

console.log(process.exitCode ? '[smoke] FAILED' : '[smoke] OK')
