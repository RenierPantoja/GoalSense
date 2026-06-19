/**
 * Smoke test — Promoted Alert Resolution (Phase B23). PURE, in-memory, no env/network.
 * ─────────────────────────────────────────────────────────────────────────────
 * Imports ONLY env-free modules (pure mapping util, pure actions reducer, Noop repo).
 * Never imports the resolution service (which loads env via createRepositories).
 *
 * Asserts the honest invariants:
 *   - missing post-promotion data ⇒ unknown (limited), never failed
 *   - corners/cards without event data ⇒ unknown, never failed
 *   - goal by score-delta only ⇒ confirmed_partial (partial-useful)
 *   - confirmed only with timed events
 *   - learning-event type maps correctly (limited vs unknown)
 *   - outcome summary never carries a score; unknown sets unknownReason not failedAt
 *   - the action reducer folds `promoted_alert_resolved` into user-state outcome
 *   - Noop B23 methods return empty / accept writes without throwing
 *
 * Build first: npm run build
 * Usage: node scripts/smokePromotedAlertResolution.mjs
 */
function assert(cond, msg) {
  if (!cond) { console.error(`  ✗ ${msg}`); process.exitCode = 1 }
  else console.log(`  ✓ ${msg}`)
}
async function load(path) {
  try { return await import(path) }
  catch (e) { console.error(`Could not import ${path}. Run \`npm run build\` first.`); console.error(e?.message || e); process.exit(1) }
}

const m = await load('../dist/modules/intelligence/autoEngine/utils/promotedAlertResolution.util.js')
const actions = await load('../dist/modules/intelligence/autoEngine/utils/autoOpportunityActions.util.js')
const noop = await load('../dist/repositories/noopIntelligence.repository.js')

const base = { goalsInWindow: 0, cornersInWindow: 0, cardsInWindow: 0, hasTimedEvents: false, hasStats: false, snapshotsAnalyzed: 0 }

console.log('[smoke] conservative outcome mapping:')
{
  const d = m.mapPromotedOutcome({ ...base, opportunityType: 'late_goal_pressure' })
  assert(d.result === 'unknown' && d.limited === true, 'no post data → unknown (limited), never failed')

  const goalEv = m.mapPromotedOutcome({ ...base, opportunityType: 'late_goal_pressure', goalsInWindow: 1, hasTimedEvents: true, hasStats: true, snapshotsAnalyzed: 3 })
  assert(goalEv.result === 'confirmed', 'goal + timed events → confirmed')

  const goalDelta = m.mapPromotedOutcome({ ...base, opportunityType: 'first_half_goal_pressure', goalsInWindow: 1, hasTimedEvents: false, hasStats: true, snapshotsAnalyzed: 3 })
  assert(goalDelta.result === 'confirmed_partial', 'goal by score delta only → confirmed_partial (partial-useful)')

  const noGoal = m.mapPromotedOutcome({ ...base, opportunityType: 'late_goal_pressure', goalsInWindow: 0, hasTimedEvents: true, hasStats: true, snapshotsAnalyzed: 4 })
  assert(noGoal.result === 'failed', 'no goal with sufficient data → failed')

  const cornersNoData = m.mapPromotedOutcome({ ...base, opportunityType: 'corners_pressure', hasStats: true, snapshotsAnalyzed: 3 })
  assert(cornersNoData.result === 'unknown' && cornersNoData.limited === true, 'corners without corner events → unknown, never failed')

  const cornersOk = m.mapPromotedOutcome({ ...base, opportunityType: 'corners_pressure', cornersInWindow: 2, hasTimedEvents: true, hasStats: true, snapshotsAnalyzed: 3 })
  assert(cornersOk.result === 'confirmed', 'corner events → confirmed')

  const cardsNoData = m.mapPromotedOutcome({ ...base, opportunityType: 'cards_pressure', hasStats: true, snapshotsAnalyzed: 3 })
  assert(cardsNoData.result === 'unknown' && cardsNoData.limited === true, 'cards without card events → unknown, never failed')

  const cardsOk = m.mapPromotedOutcome({ ...base, opportunityType: 'cards_pressure', cardsInWindow: 1, hasTimedEvents: true, hasStats: true, snapshotsAnalyzed: 3 })
  assert(cardsOk.result === 'confirmed', 'card events → confirmed')

  const sim = m.mapPromotedOutcome({ ...base, opportunityType: 'pattern_similarity', goalsInWindow: 1, hasTimedEvents: true, hasStats: true, snapshotsAnalyzed: 3 })
  assert(sim.result === 'confirmed_partial', 'pattern_similarity with goal → confirmed_partial (conservative)')

  const simNone = m.mapPromotedOutcome({ ...base, opportunityType: 'pattern_similarity', hasStats: true, snapshotsAnalyzed: 2 })
  assert(simNone.result === 'unknown', 'pattern_similarity without conclusive signal → unknown')
}

console.log('[smoke] learning event type mapping:')
{
  assert(m.learningTypeForPromotedOutcome('confirmed', false) === 'auto_opportunity_promoted_alert_confirmed', 'confirmed → confirmed event')
  assert(m.learningTypeForPromotedOutcome('confirmed_partial', false) === 'auto_opportunity_promoted_alert_partial', 'partial → partial event')
  assert(m.learningTypeForPromotedOutcome('failed', false) === 'auto_opportunity_promoted_alert_failed', 'failed → failed event')
  assert(m.learningTypeForPromotedOutcome('unknown', false) === 'auto_opportunity_promoted_alert_unknown', 'unknown (data) → unknown event')
  assert(m.learningTypeForPromotedOutcome('unknown', true) === 'auto_opportunity_promoted_alert_resolution_limited', 'unknown (limited) → resolution_limited event')
}

console.log('[smoke] outcome summary honesty:')
{
  const conf = m.buildOutcomeSummary({ opportunityId: 'o1', promotedAlertId: 'a1', result: 'confirmed', outcomeReason: 'gol', limited: false, timeToResolutionMinutes: 7, learningEventIds: ['lev_1'], resolvedAt: '2026-01-01T00:00:00.000Z' })
  assert(conf.confirmedAt && !conf.failedAt && !conf.unknownReason, 'confirmed sets confirmedAt only')
  assert(!('score' in conf) && !('probability' in conf), 'summary carries no score/probability')

  const unk = m.buildOutcomeSummary({ opportunityId: 'o2', promotedAlertId: 'a2', result: 'unknown', outcomeReason: 'sem dados', limited: true, timeToResolutionMinutes: null, learningEventIds: [], resolvedAt: '2026-01-01T00:00:00.000Z' })
  assert(unk.unknownReason && !unk.failedAt && !unk.confirmedAt, 'unknown sets unknownReason, never failedAt')

  const fail = m.buildOutcomeSummary({ opportunityId: 'o3', promotedAlertId: 'a3', result: 'failed', outcomeReason: 'sem gol', limited: false, timeToResolutionMinutes: 12, learningEventIds: [], resolvedAt: '2026-01-01T00:00:00.000Z' })
  assert(fail.failedAt && !fail.confirmedAt, 'failed sets failedAt only')
}

console.log('[smoke] action reducer folds promoted_alert_resolved:')
{
  const log = [
    { id: 'x1', opportunityId: 'o', fixtureId: 'f', userId: null, actionType: 'manual_alert_promoted', feedbackType: null, note: null, reason: null, metadata: { alertId: 'a9' }, createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'x2', opportunityId: 'o', fixtureId: 'f', userId: null, actionType: 'promoted_alert_resolved', feedbackType: null, note: null, reason: null, metadata: { alertId: 'a9', result: 'confirmed_partial', resolvedAt: '2026-01-01T00:10:00.000Z' }, createdAt: '2026-01-01T00:10:00.000Z' },
  ]
  const s = actions.summarizeActions('o', log)
  assert(s.promotedAlertId === 'a9', 'promotedAlertId preserved from promotion action')
  assert(s.promotedAlertOutcome === 'confirmed_partial', 'promotedAlertOutcome folded from resolution action')
  assert(s.promotedAlertResolvedAt === '2026-01-01T00:10:00.000Z', 'promotedAlertResolvedAt folded')
  const us = actions.userStateFromSummary('o', 'f', s)
  assert(us.promotedAlertOutcome === 'confirmed_partial' && us.promotedAlertResolvedAt, 'user-state carries outcome layer')

  // No resolution yet → outcome null (pending), promotion intact.
  const s2 = actions.summarizeActions('o', [log[0]])
  assert(s2.promotedAlertId === 'a9' && s2.promotedAlertOutcome === null, 'promoted but unresolved → outcome null (pending)')
}

console.log('[smoke] Noop B23 safety (prisma fallback):')
{
  const repo = new noop.NoopIntelligenceRepository()
  assert((await repo.getPromotedAlertOutcomeLinkByAlertId('a')) === null, 'Noop getPromotedAlertOutcomeLinkByAlertId → null')
  assert((await repo.getPromotedAlertOutcomeLinkByOpportunityId('o')) === null, 'Noop getPromotedAlertOutcomeLinkByOpportunityId → null')
  assert((await repo.getAutoOpportunityOutcomeSummary('o')) === null, 'Noop getAutoOpportunityOutcomeSummary → null')
  assert(Array.isArray(await repo.listAutoOpportunityOutcomeSummaries()), 'Noop listAutoOpportunityOutcomeSummaries → []')
  const link = { id: 'pol_a', opportunityId: 'o', promotedAlertId: 'a', ledgerId: 'led_a', outcomeId: 'out_a', result: 'unknown', resolutionType: 'promoted_goal', outcomeReason: 'x', dataQualityAtResolution: 'unknown', resolvedAt: null, source: 'promoted_alert_resolution' }
  assert((await repo.createPromotedAlertOutcomeLink(link)) === link, 'Noop createPromotedAlertOutcomeLink accepts write without throwing')
  assert((await repo.updatePromotedAlertOutcomeLink('a', {})).count === 0, 'Noop updatePromotedAlertOutcomeLink → count 0')
  const sum = { opportunityId: 'o', promotedAlertId: 'a', result: 'unknown', resultLabel: 'x', outcomeReason: 'x', confirmedAt: null, failedAt: null, unknownReason: 'x', timeToResolutionMinutes: null, learningEventIds: [], updatedAt: '2026-01-01T00:00:00.000Z' }
  assert((await repo.upsertAutoOpportunityOutcomeSummary(sum)) === sum, 'Noop upsertAutoOpportunityOutcomeSummary accepts write without throwing')
}

if (process.exitCode === 1) console.error('[smoke] FAILED')
else console.log('[smoke] OK')
