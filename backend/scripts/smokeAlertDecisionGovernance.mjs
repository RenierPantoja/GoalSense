/**
 * Smoke — Alert Decision Governance (B47 / Bloco 4). PURE policy + Noop only.
 * ─────────────────────────────────────────────────────────────────────────────
 * Verifies offline: default mode observe; enforce/shadow_block require explicit flags;
 * blocker → block_alert advisory; wait_for_lineup → hold reason; trigger resolves the
 * right hold; observe/shadow never blocks a real alert (canEnforce false); shouldBlock
 * semantics; Noop-safe governance persistence. No network.
 *
 * Build first: npm run build
 * Usage: node scripts/smokeAlertDecisionGovernance.mjs
 */
const FAILURES = []
function assert(c, m) { if (!c) { FAILURES.push(m); console.log(`  [FAIL] ${m}`) } else console.log(`  [ok] ${m}`) }
async function load(p) { try { return await import(p) } catch (e) { console.error(`Could not import ${p}. Run \`npm run build\` first.`); console.error(e?.message || e); process.exit(1) } }

const policy = await load('../dist/modules/footballIntelligence/governance/alertGovernancePolicy.service.js')
const hold = await load('../dist/modules/footballIntelligence/governance/alertGovernanceHold.service.js')

function baseInputs(over = {}) {
  return {
    phase: 'pre_match', readinessV7Status: 'ready_with_supportive_influence', precheckV7Decision: 'alert_candidate',
    influenceBand: 'supportive', influenceScore: 5, confidenceOfAssessment: 'high',
    blockerCount: 0, waitCount: 0, liveConfirmationCount: 0, contradictionCount: 0,
    conflicts: [], missingCriticalDomains: [], lineupPending: false, liveNoStats: false, ...over,
  }
}

console.log('[smoke] mode safety:')
{
  assert(policy.getGovernanceMode() === 'observe', 'default mode = observe')
  assert(policy.canEnforce() === false, 'enforce OFF by default (needs explicit flag + mode=enforce)')
}

console.log('[smoke] policy decisions:')
{
  const allow = policy.evaluatePolicyInputs(baseInputs())
  assert(allow.action === 'allow_alert', 'supportive + high confidence → allow_alert')

  const blocked = policy.evaluatePolicyInputs(baseInputs({ blockerCount: 1 }))
  assert(blocked.action === 'block_alert' && blocked.severity === 'critical', 'blocker → block_alert (critical) advisory')

  const lineup = policy.evaluatePolicyInputs(baseInputs({ lineupPending: true, precheckV7Decision: 'wait_for_lineup' }))
  assert(lineup.action === 'wait_for_lineup', 'lineup pending → wait_for_lineup')

  const conflict = policy.evaluatePolicyInputs(baseInputs({ conflicts: ['provider_vs_manual→operator_review'] }))
  assert(conflict.action === 'block_alert' || conflict.action === 'wait_for_manual_review', 'operator_review conflict → block/wait_for_manual_review (never silent)')

  const contra = policy.evaluatePolicyInputs(baseInputs({ influenceBand: 'contradictory' }))
  assert(contra.action === 'stay_out' || contra.action === 'downgrade_to_monitor', 'contradictory influence → stay_out/downgrade')

  const mixed = policy.evaluatePolicyInputs(baseInputs({ influenceBand: 'mixed', confidenceOfAssessment: 'medium' }))
  assert(mixed.action === 'allow_monitor_only', 'mixed influence → monitor only (never strong)')

  const insufficient = policy.evaluatePolicyInputs(baseInputs({ influenceBand: 'insufficient_data', precheckV7Decision: 'monitor', readinessV7Status: 'insufficient_influence_data' }))
  assert(insufficient.action === 'allow_monitor_only' || insufficient.action === 'downgrade_to_monitor', 'insufficient influence → monitor (not negative)')

  const live = policy.evaluatePolicyInputs(baseInputs({ phase: 'live', liveNoStats: true, liveConfirmationCount: 1 }))
  assert(live.action === 'wait_for_live_confirmation', 'live without stats → wait_for_live_confirmation')

  const post = policy.evaluatePolicyInputs(baseInputs({ phase: 'post_match' }))
  assert(post.action === 'post_match_learning_only', 'finished → post_match_learning_only')
}

console.log('[smoke] hold creation + block semantics:')
{
  assert(policy.shouldCreateHold('wait_for_lineup') === 'lineup_pending', 'wait_for_lineup → hold lineup_pending')
  assert(policy.shouldCreateHold('wait_for_live_confirmation') === 'live_confirmation_pending', 'wait_for_live_confirmation → hold live_confirmation_pending')
  assert(policy.shouldCreateHold('allow_alert') === null, 'allow_alert → no hold')
  assert(policy.shouldBlockInEnforce('block_alert') === true, 'block_alert is blockable in enforce')
  assert(policy.shouldBlockInEnforce('allow_monitor_only') === false, 'monitor not blockable')
  // observe/shadow: even a block action would NOT actually block because canEnforce()===false.
  assert((policy.canEnforce() && policy.shouldBlockInEnforce('block_alert')) === false, 'observe → actuallyBlocked would be false (never blocks real alert)')
}

console.log('[smoke] trigger resolves the right hold reason:')
{
  assert(hold.triggerResolvesReason('lineup_confirmed', 'lineup_pending') === true, 'lineup_confirmed resolves lineup_pending')
  assert(hold.triggerResolvesReason('goal', 'lineup_pending') === false, 'goal does not resolve lineup_pending')
  assert(hold.triggerResolvesReason('red_card', 'live_confirmation_pending') === true, 'red_card resolves live_confirmation_pending')
  assert(hold.triggerResolvesReason('domain_refreshed', 'domain_pending') === true, 'domain_refreshed resolves domain_pending')
  assert(hold.triggerResolvesReason('manual_record_created', 'manual_review_pending') === true, 'manual record resolves manual_review_pending')
}

console.log('[smoke] Noop repo safe — governance reads empty, writes accepted:')
{
  const { NoopIntelligenceRepository } = await load('../dist/repositories/noopIntelligence.repository.js')
  const repo = new NoopIntelligenceRepository()
  const result = { id: 'agr_x', fixtureId: 'f1', patternId: null, action: 'allow_monitor_only' }
  assert((await repo.saveAlertDecisionGovernanceResult(result)).id === 'agr_x', 'Noop saves governance result (returns input)')
  assert((await repo.getAlertDecisionGovernanceResult('agr_x')) === null, 'Noop get governance result → null')
  assert((await repo.listGovernanceResultsByFixture('f1')).length === 0, 'Noop list by fixture → []')
  const h = { id: 'agh_x', fixtureId: 'f1', reason: 'lineup_pending', status: 'active' }
  assert((await repo.saveAlertGovernanceHold(h)).id === 'agh_x', 'Noop saves hold')
  assert((await repo.listAlertGovernanceHolds({ fixtureId: 'f1' })).length === 0, 'Noop list holds → []')
  assert((await repo.updateAlertGovernanceHold('agh_x', { status: 'resolved' })).count === 0, 'Noop update hold → count 0 (no persistence)')
  const run = { id: 'agrun_x', scope: 'live_trigger', fixtureId: 'f1' }
  assert((await repo.createAlertGovernanceRun(run)).id === 'agrun_x', 'Noop create governance run')
  assert((await repo.listAlertGovernanceRuns()).length === 0, 'Noop list runs → []')
  const inv = { id: 'ainv_x', fixtureId: 'f1' }
  assert((await repo.saveAssumptionInvalidation(inv)).id === 'ainv_x', 'Noop saves assumption invalidation')
  assert((await repo.listAssumptionInvalidationsByFixture('f1')).length === 0, 'Noop list invalidations → []')
}

if (FAILURES.length > 0) { console.log(`[smoke] FAILED (${FAILURES.length}): ${FAILURES.join(' | ')}`); process.exitCode = 1 }
else console.log('[smoke] OK')
