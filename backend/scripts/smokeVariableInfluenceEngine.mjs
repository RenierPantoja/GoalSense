/**
 * Smoke — Variable Influence Engine (B46 / Bloco 3). PURE + Noop only.
 * ─────────────────────────────────────────────────────────────────────────────
 * Verifies offline: absence never becomes negative; lineup_missing → wait (not
 * failure); key_player_missing with unknown importance never critical; manual high
 * reliability supports with manual source; manual conflict → conflict_requires_review;
 * weak sample reduces magnitude; H2H insufficient never high; pattern family unknown →
 * conservative; blocking dominates aggregate; mixed never strong; influenceScore is
 * not a probability; precheck observe-first; Noop-safe.
 *
 * Build first: npm run build
 * Usage: node scripts/smokeVariableInfluenceEngine.mjs
 */
const FAILURES = []
function assert(c, m) { if (!c) { FAILURES.push(m); console.log(`  [FAIL] ${m}`) } else console.log(`  [ok] ${m}`) }
async function load(p) { try { return await import(p) } catch (e) { console.error(`Could not import ${p}. Run \`npm run build\` first.`); console.error(e?.message || e); process.exit(1) } }

const tax = await load('../dist/modules/footballIntelligence/influence/variableTaxonomy.service.js')
const sens = await load('../dist/modules/footballIntelligence/influence/patternSensitivity.service.js')
const rule = await load('../dist/modules/footballIntelligence/influence/variableInfluenceRuleEngine.service.js')
const agg = await load('../dist/modules/footballIntelligence/influence/influenceAggregator.service.js')
const conflict = await load('../dist/modules/footballIntelligence/influence/variableConflictEngine.service.js')
const pre = await load('../dist/modules/footballIntelligence/alertDecisionPrecheck.service.js')

let n = 0
function vin(variableKey, category, opts = {}) {
  n++
  return {
    id: `vin_test_${n}`, fixtureId: 'f1', patternId: null, variableKey, category,
    label: variableKey, rawValue: opts.rawValue ?? 'v', source: opts.source ?? 'derived_context',
    dataQuality: opts.dataQuality ?? 'partial', sampleQuality: opts.sampleQuality, reliability: opts.reliability ?? 'medium',
    evidenceRefs: [], limitations: [],
  }
}

const goals = sens.getPatternSensitivityProfile({ id: 'over25', name: 'Over 2.5 gols', type: 'goals' })
const unknownFam = sens.getPatternSensitivityProfile({ id: 'mystery_x', name: 'xyz', type: 'xyz' })

console.log('[smoke] pattern sensitivity:')
{
  assert(goals.patternFamily === 'goals', 'over 2.5 → family goals')
  assert(unknownFam.patternFamily === 'unknown', 'unmatched pattern → family unknown')
  assert(unknownFam.criticalVariables.length === 0, 'unknown family → conservative (no critical vars)')
}

console.log('[smoke] absence never becomes negative:')
{
  const a = rule.assessVariableInfluence(vin('injury_data_missing', 'injury', { reliability: 'unavailable', dataQuality: 'unavailable' }), goals)
  assert(a.direction === 'uncertain' && !a.contradicts, 'injury_data_missing → uncertain, not negative')
  assert(a.magnitude === 'unknown', 'absence variable → magnitude unknown (no weight)')
}

console.log('[smoke] lineup_missing → wait, not failure:')
{
  const a = rule.assessVariableInfluence(vin('lineup_missing', 'lineup', { reliability: 'unavailable' }), goals)
  assert(a.direction === 'wait', 'lineup_missing → wait')
  assert(a.contradicts === false && a.blocks === false, 'lineup_missing not contradiction/block')
}

console.log('[smoke] key_player_missing unknown importance never critical:')
{
  const a = rule.assessVariableInfluence(vin('key_player_missing', 'player_importance', { reliability: 'low', sampleQuality: 'unknown' }), goals)
  assert(a.magnitude !== 'critical', 'key_player_missing w/ unknown importance → not critical')
}

console.log('[smoke] manual high reliability supports w/ manual source:')
{
  const a = rule.assessVariableInfluence(vin('manual_data_high_reliability', 'data_readiness', { source: 'manual_data', reliability: 'medium' }), goals)
  assert(a.supports === true && a.source === 'manual_data', 'manual high reliability → supports, source stays manual')
}

console.log('[smoke] manual conflict → blocking + conflict_requires_review:')
{
  const v = vin('manual_data_conflict', 'data_readiness', { reliability: 'conflicting' })
  const a = rule.assessVariableInfluence(v, goals)
  assert(a.direction === 'blocking' && a.blocks, 'manual_data_conflict → blocking')
  const conflicts = conflict.detectVariableConflicts('f1', null, [v], [a])
  assert(conflicts.some(c => c.conflictType === 'provider_vs_manual' && c.recommendedAction === 'operator_review'), 'manual conflict → operator_review')
}

console.log('[smoke] weak sample reduces magnitude:')
{
  const a = rule.assessVariableInfluence(vin('attack_weakened', 'lineup', { reliability: 'weak_sample' }), goals)
  assert(a.magnitude === 'low', 'weak_sample → magnitude low (no strong conclusion)')
}

console.log('[smoke] H2H insufficient never high influence:')
{
  const a = rule.assessVariableInfluence(vin('sample_too_small', 'matchup_memory', { reliability: 'unavailable', sampleQuality: 'insufficient' }), goals)
  assert(a.magnitude === 'unknown' && a.direction === 'uncertain', 'H2H insufficient → uncertain/unknown, never high')
}

console.log('[smoke] aggregate: blocking dominates; mixed never strong; score not probability:')
{
  const block = rule.assessVariableInfluence(vin('manual_data_conflict', 'data_readiness', { reliability: 'conflicting' }), goals)
  const pos = rule.assessVariableInfluence(vin('manual_data_high_reliability', 'data_readiness', { source: 'manual_data', reliability: 'high' }), goals)
  const blockedAgg = agg.aggregateInfluences('f1', null, [block, pos])
  assert(blockedAgg.netInfluenceBand === 'blocked', 'blocking dominates → band blocked')

  // strong positive + strong negative → mixed (use critical vars for goals family at high reliability)
  const sp = rule.assessVariableInfluence(vin('early_goal', 'live_event', { reliability: 'high' }), goals)
  const sn = rule.assessVariableInfluence(vin('attack_weakened', 'lineup', { reliability: 'high' }), goals)
  const mixedAgg = agg.aggregateInfluences('f1', null, [sp, sn])
  assert(mixedAgg.netInfluenceBand === 'mixed', 'strong + / strong - → mixed (not strong)')

  assert(typeof blockedAgg.influenceScore === 'number', 'influenceScore is a number (internal weight, NOT probability)')
  const empty = agg.aggregateInfluences('f1', null, [])
  assert(empty.netInfluenceBand === 'unknown' && empty.confidenceOfAssessment === 'unknown', 'no influences → unknown band + unknown confidence')
}

console.log('[smoke] insufficient when all unusable:')
{
  const u1 = rule.assessVariableInfluence(vin('injury_data_missing', 'injury', { reliability: 'unavailable' }), goals)
  const u2 = rule.assessVariableInfluence(vin('suspension_data_missing', 'suspension', { reliability: 'unavailable' }), goals)
  const a = agg.aggregateInfluences('f1', null, [u1, u2])
  assert(a.netInfluenceBand === 'insufficient_data', 'all unusable → insufficient_data (not negative)')
}

console.log('[smoke] precheck observe-first (V1..V7 share mode):')
{
  assert(pre.precheckMode() === 'observe', 'precheck mode = observe by default')
  assert(pre.isPrecheckEnabled() === false, 'precheck disabled by default (never blocks real alert)')
}

console.log('[smoke] taxonomy honest:')
{
  assert(tax.isAbsenceLimitation('injury_data_missing') === true, 'injury_data_missing is an absence limitation')
  assert(tax.isAbsenceLimitation('early_goal') === false, 'early_goal is a fact, not absence')
  assert(tax.getDefaultDirectionRules('lineup_missing') === 'wait', 'lineup_missing default direction wait')
}

console.log('[smoke] Noop repo safe — influence reads empty:')
{
  const { NoopIntelligenceRepository } = await load('../dist/repositories/noopIntelligence.repository.js')
  const repo = new NoopIntelligenceRepository()
  const entry = { id: 'ile_x', fixtureId: 'f1', patternId: null }
  assert((await repo.saveInfluenceLedgerEntry(entry)).id === 'ile_x', 'Noop saves influence entry (returns input)')
  assert((await repo.getInfluenceLedgerEntry('ile_x')) === null, 'Noop get influence entry → null')
  assert((await repo.listInfluenceLedgerEntries()).length === 0, 'Noop list influence entries → []')
  assert((await repo.listInfluenceBuildRuns()).length === 0, 'Noop list influence build runs → []')
  const run = { id: 'ibr_x', scope: 'fixture' }
  assert((await repo.createInfluenceBuildRun(run)).id === 'ibr_x', 'Noop create influence build run (returns input)')
}

if (FAILURES.length > 0) { console.log(`[smoke] FAILED (${FAILURES.length}): ${FAILURES.join(' | ')}`); process.exitCode = 1 }
else console.log('[smoke] OK')
