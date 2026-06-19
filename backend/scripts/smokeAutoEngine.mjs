/**
 * Smoke test — Automatic Engine (Phase B19). PURE, in-memory, no network/env.
 * ─────────────────────────────────────────────────────────────────────────────
 * Imports ONLY env-free modules (scoring, risk gate, explainability, context util,
 * id util, Noop repo). Never imports autoEngine.service (which loads env via
 * createRepositories). Creates NO alerts, NO odds, NO data, never reaches Firebase.
 *
 * Asserts the invariants:
 *   - flags-off path is owned by the service (not exercised here — pure only)
 *   - risk gate blocks missing data / not-live / stale / poor data
 *   - score penalizes insufficient sample + high unknown; never a probability
 *   - `unknown`/missing data is a BLOCK reason, never a "failure"
 *   - opportunity id deterministic (same fixture/type/minute-bucket → same id)
 *   - confidence band capped by sample quality (no "high" on weak samples)
 *   - explainability never invents H2H/odds; flags heuristic/limited context
 *   - Noop adapter (prisma fallback) returns empty/accepts writes without throwing
 *
 * Build first: npm run build
 * Usage: node scripts/smokeAutoEngine.mjs
 */
function assert(cond, msg) {
  if (!cond) { console.error(`  ✗ ${msg}`); process.exitCode = 1 }
  else console.log(`  ✓ ${msg}`)
}
async function load(path) {
  try { return await import(path) }
  catch (e) { console.error(`Could not import ${path}. Run \`npm run build\` first.`); console.error(e?.message || e); process.exit(1) }
}

const scoring = await load('../dist/modules/intelligence/autoEngine/autoSignalScoring.service.js')
const risk = await load('../dist/modules/intelligence/autoEngine/autoSignalRiskGate.service.js')
const explain = await load('../dist/modules/intelligence/autoEngine/autoSignalExplainability.service.js')
const ctxUtil = await load('../dist/modules/intelligence/autoEngine/utils/autoSignalContext.util.js')
const idUtil = await load('../dist/modules/intelligence/autoEngine/utils/autoSignalId.util.js')
const noop = await load('../dist/repositories/noopIntelligence.repository.js')

// ── Deterministic ids ────────────────────────────────────────────────────────
console.log('[smoke] deterministic opportunity id:')
const idA = idUtil.autoOpportunityId('espn:123', 'late_goal_pressure', 72)
const idB = idUtil.autoOpportunityId('espn:123', 'late_goal_pressure', 74) // same 70-bucket
const idC = idUtil.autoOpportunityId('espn:123', 'late_goal_pressure', 81) // different bucket
assert(idA === idB, 'same fixture/type within a 5-min bucket → identical id (upsert, no dupes)')
assert(idA !== idC, 'different minute bucket → different id')
assert(idUtil.autoRunId().startsWith('aer_'), 'run id prefixed aer_')

// ── Scoring is quality, not probability ──────────────────────────────────────
console.log('[smoke] scoring honesty:')
const strong = scoring.scoreOpportunity({
  baseScore: 38, recentOffensive: 3, hasLiveStats: true, scoreDiff: 1, importanceLabel: 'alta',
  patternProfile: { usefulRate: 0.72, sampleQuality: 'strong', unknownRate: 0.1 },
  competitionUsefulRate: 0.6, teamUsefulRate: 0.55, minuteWindowUsefulRate: 0.65,
  dataQuality: 'rich', unknownRate: 0.1,
})
assert(strong.finalScore > 0 && strong.finalScore <= 100, 'final score bounded 0..100')
assert(strong.patternLearningScore > 0, 'good learning sample lifts score')

const weak = scoring.scoreOpportunity({
  baseScore: 38, recentOffensive: 0, hasLiveStats: false, scoreDiff: 3, importanceLabel: 'baixa',
  patternProfile: { usefulRate: null, sampleQuality: 'insufficient', unknownRate: 0.5 },
  competitionUsefulRate: null, teamUsefulRate: null, minuteWindowUsefulRate: null,
  dataQuality: 'poor', unknownRate: 0.5,
})
assert(weak.riskPenalty > 0, 'insufficient sample + high unknown → risk penalty applied')
assert(weak.dataQualityScore < 0, 'poor data quality penalizes score')
assert(weak.finalScore < strong.finalScore, 'weak context scores below strong context')

// ── Risk gate: missing data / not-live / stale all block (never "fail") ──────
console.log('[smoke] risk gate blocks (not failures):')
const base = {
  isLive: true, dataQuality: 'rich', snapshotAgeMs: 1000, requiredDataPresent: true, hasEvidence: true,
  learningDependent: false, sampleQuality: 'insufficient', minSampleQuality: 'moderate', historicallyWeak: false,
  unknownRate: 0.1, hasRecentManualAlert: false, isDuplicate: false, oppCountForFixture: 0, maxOppsPerFixture: 3,
  score: 70, minScore: 55,
}
assert(risk.evaluateRiskGate(base).allowed === true, 'clean live + rich data + evidence → allowed')

const missing = risk.evaluateRiskGate({ ...base, requiredDataPresent: false })
assert(missing.allowed === false && missing.blockReasons.includes('missing_required_data'), 'missing required data → blocked (not failed)')

const notLive = risk.evaluateRiskGate({ ...base, isLive: false })
assert(notLive.blockReasons.includes('not_live'), 'not live → blocked')

const stale = risk.evaluateRiskGate({ ...base, snapshotAgeMs: 6 * 60 * 1000 })
assert(stale.blockReasons.includes('provider_stale'), 'stale snapshot → blocked')

const poor = risk.evaluateRiskGate({ ...base, dataQuality: 'unknown' })
assert(poor.blockReasons.includes('data_poor'), 'unknown data quality → blocked (unknown ≠ failure)')

const lowScore = risk.evaluateRiskGate({ ...base, score: 40 })
assert(lowScore.blockReasons.includes('score_below_minimum'), 'score below minimum → blocked')

// learning-dependent strategy needs a real sample; live-only does not
const learnInsufficient = risk.evaluateRiskGate({ ...base, learningDependent: true, sampleQuality: 'insufficient' })
assert(learnInsufficient.blockReasons.includes('sample_quality_insufficient'), 'learning-dependent + insufficient sample → blocked')
const liveInsufficient = risk.evaluateRiskGate({ ...base, learningDependent: false, sampleQuality: 'insufficient' })
assert(liveInsufficient.allowed === true, 'live-only strategy tolerates insufficient sample (limited context, not blocked)')

const partial = risk.evaluateRiskGate({ ...base, dataQuality: 'partial' })
assert(partial.allowed === true && partial.finalDecision === 'reduce' && partial.penalties.length > 0, 'partial data → allowed but reduced (penalty, not block)')

// ── Confidence band capped by sample quality ─────────────────────────────────
console.log('[smoke] confidence band cap:')
assert(ctxUtil.confidenceBandFor(90, 'strong', 'rich') === 'high', 'high score + strong sample + rich → high')
assert(ctxUtil.confidenceBandFor(90, 'moderate', 'rich') === 'medium', 'high score but only moderate sample → capped to medium')
assert(ctxUtil.confidenceBandFor(90, 'insufficient', 'poor') === 'insufficient_data', 'poor data → insufficient_data band')
assert(ctxUtil.statusFromScore(80, 55, 'strong') === 'strong', 'high score + good sample → strong')
assert(ctxUtil.statusFromScore(80, 55, 'insufficient') === 'watch', 'high score but no sample → at most watch (never strong)')
assert(ctxUtil.statusFromScore(40, 55, 'strong') === 'candidate', 'below minScore → candidate')

// ── recentOffensiveCount uses only real events ───────────────────────────────
console.log('[smoke] recent offensive count (real events only):')
const off = ctxUtil.recentOffensiveCount([
  { minute: 68, type: 'corner' }, { minute: 71, type: 'shot_on_target' }, { minute: 50, type: 'goal' },
], 72)
assert(off === 2, 'counts only offensive events inside the 10-min window')
assert(ctxUtil.recentOffensiveCount(null, 72) === 0, 'no events → 0 (never invented)')

// ── Explainability never invents, flags heuristic/limited + block reasons ────
console.log('[smoke] explainability honesty:')
const exp = explain.buildExplanation({
  opportunityType: 'late_goal_pressure', minute: 73, scoreState: { home: 1, away: 1 },
  evidence: { liveStatsUsed: { shotsHome: 6 }, minute: 73, scoreState: { home: 1, away: 1 }, recentOffensiveEvents: 2, passedSignals: ["Reta final (≥70')"], missingData: ['escanteios'], dataQuality: 'partial', provider: 'espn' },
  contextFit: { competitionType: 'league', importanceLabel: 'média', minuteWindow: '70-80', matchedLearningContexts: [], sampleQuality: 'insufficient', source: 'limited', notes: [] },
  riskGate: { allowed: false, blockReasons: ['missing_required_data'], penalties: [], warnings: [], finalDecision: 'block' },
  relatedPatternName: null,
})
const blob = JSON.stringify(exp).toLowerCase()
assert(!blob.includes('odd') && !blob.includes('aposta') && !blob.includes('%25 de chance'), 'explanation has no odds/bet/probability language')
assert(exp.historicalContext.some(s => s.includes('limitado')), 'limited context is flagged honestly')
assert(exp.risks.some(s => s.toLowerCase().includes('bloqueado')), 'block reason surfaced in risks')
assert(exp.evidenceUsed.some(s => s.toLowerCase().includes('ausentes')), 'missing data surfaced, not hidden')

// ── Noop adapter (prisma fallback) — empty reads, writes do not throw ────────
console.log('[smoke] Noop adapter (prisma mode safety):')
const repo = new noop.NoopIntelligenceRepository()
assert((await repo.listAutoEngineRuns(10)).length === 0, 'Noop listAutoEngineRuns → []')
assert((await repo.getAutoEngineRun('x')) === null, 'Noop getAutoEngineRun → null')
assert((await repo.getLatestAutoEngineRun()) === null, 'Noop getLatestAutoEngineRun → null')
assert((await repo.listAutoOpportunities({})).length === 0, 'Noop listAutoOpportunities → []')
assert((await repo.getAutoOpportunity('x')) === null, 'Noop getAutoOpportunity → null')
assert((await repo.listAutoOpportunitiesByFixture('f', 10)).length === 0, 'Noop listAutoOpportunitiesByFixture → []')
await repo.createAutoEngineRun({ id: 'aer_x' })
await repo.updateAutoEngineRun('aer_x', {})
await repo.upsertAutoOpportunity({ id: 'aop_x' })
assert(true, 'Noop create/update/upsert accept writes without throwing (no persistence)')

console.log(process.exitCode ? '[smoke] FAILED' : '[smoke] OK')
