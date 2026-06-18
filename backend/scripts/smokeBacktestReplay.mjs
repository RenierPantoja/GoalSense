/**
 * Smoke test — Backtest & Replay (Phase B14). PURE, in-memory, no network/env.
 * ─────────────────────────────────────────────────────────────────────────────
 * Imports only env-free modules (outcome, summary, timeline util, Noop repo).
 * Creates NO alerts, NO data, never reaches Firebase.
 *
 * Build first: npm run build
 * Usage: node scripts/smokeBacktestReplay.mjs
 */
function assert(cond, msg) {
  if (!cond) { console.error(`  ✗ ${msg}`); process.exitCode = 1 }
  else console.log(`  ✓ ${msg}`)
}
async function load(path) {
  try { return await import(path) }
  catch (e) { console.error(`Could not import ${path}. Run \`npm run build\` first.`); console.error(e?.message || e); process.exit(1) }
}

const outcome = await load('../dist/modules/intelligence/backtest/backtestOutcome.service.js')
const summary = await load('../dist/modules/intelligence/backtest/backtestSummary.service.js')
const tl = await load('../dist/modules/intelligence/backtest/utils/replayTimeline.util.js')
const noop = await load('../dist/repositories/noopIntelligence.repository.js')

console.log('[smoke] timeline ordering:')
const ordered = tl.orderSnapshotsChronologically([
  { capturedAt: '2026-01-01T10:10:00Z', minute: 20 },
  { capturedAt: '2026-01-01T10:00:00Z', minute: 10 },
  { capturedAt: '2026-01-01T10:05:00Z', minute: 15 },
])
assert(ordered[0].minute === 10 && ordered[2].minute === 20, 'snapshots sorted chronologically (asc)')
assert(tl.snapshotsAfter(ordered, 0).length === 2, 'snapshotsAfter returns post-trigger slice')

console.log('[smoke] honest outcome estimation:')
const noPost = outcome.estimateOutcome({ patternName: 'Pressão de Gol', triggerMinute: 70, triggerScore: { home: 1, away: 1 }, postSnapshots: [] })
assert(noPost.outcome === 'not_evaluable', 'no post snapshots → not_evaluable (never failed)')

const goalConfirmed = outcome.estimateOutcome({
  patternName: 'Pressão de Gol', triggerMinute: 70, triggerScore: { home: 1, away: 1 },
  postSnapshots: [{ minute: 78, scoreHome: 2, scoreAway: 1, status: '2H', statsJson: '{"shotsHome":5}', eventsJson: '[{"minute":75,"type":"goal"}]' }],
})
assert(goalConfirmed.outcome === 'confirmed', 'goal in window with timed events → confirmed')

const noData = outcome.estimateOutcome({
  patternName: 'Pressão de Gol', triggerMinute: 70, triggerScore: { home: 1, away: 1 },
  postSnapshots: [{ minute: 80, scoreHome: 1, scoreAway: 1, status: '2H', statsJson: null, eventsJson: null }],
})
assert(noData.outcome === 'unknown', 'no events/stats post-trigger → unknown (not failed)')

const failedCase = outcome.estimateOutcome({
  patternName: 'Pressão de Gol', triggerMinute: 70, triggerScore: { home: 1, away: 1 },
  postSnapshots: [{ minute: 90, scoreHome: 1, scoreAway: 1, status: 'FT', statsJson: '{"shotsHome":6}', eventsJson: '[{"minute":72,"type":"corner"}]' }],
})
assert(failedCase.outcome === 'failed', 'finished, data present, no goal → failed')

console.log('[smoke] summary rates:')
const mk = (over, league, minute, wouldTrigger = true) => ({
  fixtureId: `${league}_${minute}_${over}`, fixtureLabel: 'A vs B', leagueName: league, homeTeam: 'A', awayTeam: 'B',
  minute, scoreState: { home: 1, away: 1 }, wouldTrigger, confidenceAtTrigger: 70,
  matchedConditions: ['is_live'], missingConditions: wouldTrigger ? [] : ['shots_on_target_gte'], blockedReasons: [],
  dataQuality: 'partial', matchContext: null, estimatedOutcome: over, outcomeReason: 'x', evidence: null,
})
const coverage = { fixturesFound: 6, fixturesWithSnapshots: 6, fixturesWithoutSnapshots: 0, snapshotsEvaluated: 60, richDataCount: 10, partialDataCount: 40, poorDataCount: 10, unknownDataCount: 0, notEvaluableCount: 0, providerBreakdown: { espn: 60 } }
const results = [
  mk('confirmed', 'Serie A', 75), mk('confirmed_partial', 'Serie A', 80), mk('failed', 'Serie B', 60),
  mk('unknown', 'Serie B', 65), mk('not_evaluable', 'Serie C', 70), mk('confirmed', 'Serie A', 72, false),
]
const sum = summary.buildBacktestSummary(results, coverage)
// triggered decisive = confirmed(1)+partial(1)+failed(1)+unknown(1) = 4 (not_evaluable excluded; one is wouldTrigger=false)
assert(sum.signalsTriggered === 5, 'counts only wouldTrigger results as triggered (5)')
assert(sum.usefulRate === 0.5, 'usefulRate includes confirmed_partial = 2/4 = 0.5')
assert(sum.failedRate === 0.25, 'failedRate excludes unknown/not_evaluable = 1/4 = 0.25')
assert(sum.unknownRate === 0.25, 'unknownRate explicit = 1/4 = 0.25')
assert(sum.sampleQuality === 'insufficient', 'small decisive sample → insufficient (no strong ranking)')
assert(sum.commonMissingConditions.some(m => m.condition === 'shots_on_target_gte'), 'non-trigger missing conditions surfaced')

console.log('[smoke] Noop adapter (prisma mode safety):')
const repo = new noop.NoopIntelligenceRepository()
assert((await repo.listBacktestRuns({})).length === 0, 'Noop listBacktestRuns → []')
assert((await repo.getBacktestRun('x')) === null, 'Noop getBacktestRun → null')
assert((await repo.getReplayRun('x')) === null, 'Noop getReplayRun → null')
const r = await repo.createBacktestRun({ id: 'bt_x' })
assert(r && r.id === 'bt_x', 'Noop createBacktestRun returns the run (no throw)')

console.log(process.exitCode ? '[smoke] FAILED' : '[smoke] OK')
