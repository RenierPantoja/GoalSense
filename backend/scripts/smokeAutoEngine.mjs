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
const promotion = await load('../dist/modules/intelligence/autoEngine/utils/autoOpportunityPromotion.util.js')
const actions = await load('../dist/modules/intelligence/autoEngine/utils/autoOpportunityActions.util.js')

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

// ── B21: promotion plan builder (PURE, only real evidence) ───────────────────
console.log('[smoke] B21 promotion plan honesty:')
function mkOpp(over = {}) {
  return {
    id: 'aop_test', runId: 'aer_x', fixtureId: 'fx_1', fixtureLabel: 'A vs B', leagueName: 'Serie A',
    homeTeam: 'A', awayTeam: 'B', minute: 78, scoreState: { home: 1, away: 1 },
    opportunityType: 'late_goal_pressure', status: 'watch', score: 64, confidenceBand: 'medium',
    scoreBreakdown: {}, evidence: { liveStatsUsed: { shotsOnTargetHome: 4, shotsOnTargetAway: 2 }, minute: 78, scoreState: { home: 1, away: 1 }, recentOffensiveEvents: 2, passedSignals: ["Reta final (≥70')"], missingData: [], dataQuality: 'partial', provider: 'espn' },
    contextFit: { competitionType: 'league', importanceLabel: 'média', minuteWindow: '70-80', matchedLearningContexts: [], sampleQuality: 'moderate', source: 'observed', notes: [] },
    riskGate: { allowed: true, blockReasons: [], penalties: [], warnings: [], finalDecision: 'allow' },
    relatedPatternIds: [], learningProfileRefs: [], dataAvailability: {}, explanation: { headline: 'Pressão por gol na reta final', whyNow: [], evidenceUsed: [], historicalContext: [], risks: [], relatedPatternNote: null },
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...over,
  }
}
const plan = promotion.buildPromotionPlan(mkOpp())
assert(plan.id === 'apl_aop_test', 'promotion plan id is deterministic (apl_<oppId>)')
assert(plan.sufficient === true, 'late_goal_pressure with SOT → has signal conditions (sufficient)')
assert(plan.suggestedEligibilityConditions.some(c => c.type === 'is_live'), 'always includes is_live eligibility')
assert(plan.suggestedSignalConditions.some(c => c.type === 'score_diff_lte'), 'derives score_diff_lte from tight score')
assert(plan.suggestedSignalConditions.some(c => c.type === 'shots_on_target_gte'), 'derives SOT signal only because SOT present')
assert(plan.suggestedConfidence >= 50 && plan.suggestedConfidence <= 75, 'suggestedConfidence clamped to a sane range (not a probability)')

const thinPlan = promotion.buildPromotionPlan(mkOpp({ opportunityType: 'pattern_similarity', evidence: { liveStatsUsed: null, minute: 80, scoreState: { home: 1, away: 1 }, recentOffensiveEvents: 0, passedSignals: [], missingData: [], dataQuality: 'partial', provider: 'espn' } }))
assert(thinPlan.sufficient === false, 'pattern_similarity without derivable signals → sufficient=false')
assert(thinPlan.limitations[0].includes('evidência suficiente'), 'thin plan flags "evidência suficiente para gerar radar" limitation')

const heurPlan = promotion.buildPromotionPlan(mkOpp({ contextFit: { competitionType: 'cup', importanceLabel: 'alta', minuteWindow: '70-80', matchedLearningContexts: [], sampleQuality: 'insufficient', source: 'heuristic', notes: [] } }))
assert(heurPlan.limitations.some(l => l.includes('heurístico')), 'heuristic context is flagged in limitations')
assert(heurPlan.limitations.some(l => l.includes('insuficiente')), 'insufficient sample is flagged in limitations')

// ── B21: action summary reducer (PURE) ───────────────────────────────────────
console.log('[smoke] B21 action summary reducer:')
const acts = [
  { id: 'a1', opportunityId: 'o', fixtureId: 'f', userId: null, actionType: 'saved', feedbackType: null, note: null, reason: null, metadata: null, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'a2', opportunityId: 'o', fixtureId: 'f', userId: null, actionType: 'note_added', feedbackType: null, note: 'olho nisso', reason: null, metadata: null, createdAt: '2026-01-01T00:01:00Z' },
  { id: 'a3', opportunityId: 'o', fixtureId: 'f', userId: null, actionType: 'marked_useful', feedbackType: 'useful', note: null, reason: null, metadata: null, createdAt: '2026-01-01T00:02:00Z' },
  { id: 'a4', opportunityId: 'o', fixtureId: 'f', userId: null, actionType: 'unsaved', feedbackType: null, note: null, reason: null, metadata: null, createdAt: '2026-01-01T00:03:00Z' },
]
const sum = actions.summarizeActions('o', acts)
assert(sum.saved === false, 'saved then unsaved → final saved=false (last write wins)')
assert(sum.noteCount === 1 && sum.notes[0].note === 'olho nisso', 'notes folded from note_added actions')
assert(sum.lastFeedback === 'useful' && sum.feedbackCounts.useful === 1, 'feedback folded; lastFeedback tracked')
assert(sum.totalActions === 4, 'totalActions counts the full log')
const emptySum = actions.summarizeActions('o', [])
assert(emptySum.saved === false && emptySum.totalActions === 0 && emptySum.lastFeedback === null, 'empty log → honest empty summary')

console.log('[smoke] B21 Noop action/promotion safety:')
assert((await repo.listAutoOpportunityActions()).length === 0, 'Noop listAutoOpportunityActions → []')
assert((await repo.getAutoOpportunityUserState('x')) === null, 'Noop getAutoOpportunityUserState → null')
assert((await repo.getAutoOpportunityPromotionPlan('x')) === null, 'Noop getAutoOpportunityPromotionPlan → null')
await repo.createAutoOpportunityAction({ id: 'aoa_x' })
await repo.upsertAutoOpportunityUserState({ id: 'aus_x' })
await repo.createAutoOpportunityPromotionPlan({ id: 'apl_x' })
assert(true, 'Noop B21 writes accepted without throwing (no persistence)')

console.log(process.exitCode ? '[smoke] FAILED' : '[smoke] OK')
