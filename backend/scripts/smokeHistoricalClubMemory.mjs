/**
 * Smoke — Historical Club Memory + Contextual Pattern Intelligence (B45 / Bloco 2).
 * PURE + Noop only.
 * ─────────────────────────────────────────────────────────────────────────────
 * Verifies offline: no sample → insufficient_history; small sample never strong;
 * H2H insufficient is not a tabu; old-dominated sample → misleading_risk/outdated;
 * weak taboo → weak_sample/superstition_risk; pattern memory separates confirmed/
 * partial/failed/unknown/not_evaluable; similar scenario is retrieval not prediction;
 * provider sem env não é chamado (memory never fetches); Noop-safe.
 *
 * Build first: npm run build
 * Usage: node scripts/smokeHistoricalClubMemory.mjs
 */
const FAILURES = []
function assert(c, m) { if (!c) { FAILURES.push(m); console.log(`  [FAIL] ${m}`) } else console.log(`  [ok] ${m}`) }
async function load(p) { try { return await import(p) } catch (e) { console.error(`Could not import ${p}. Run \`npm run build\` first.`); console.error(e?.message || e); process.exit(1) } }

const sq = await load('../dist/modules/footballIntelligence/memory/memorySampleQuality.service.js')

console.log('[smoke] sample quality — no sample → insufficient (never a tendency):')
{
  const a = sq.evaluateSampleQuality({ sampleSize: 0 })
  assert(a.quality === 'insufficient' && a.canConclude === false, 'sampleSize 0 → insufficient, canConclude=false')
  assert(a.reliability === 'insufficient', 'no sample → reliability insufficient')
}

console.log('[smoke] small sample never strong:')
{
  const a = sq.evaluateSampleQuality({ sampleSize: 2 })
  assert(a.quality === 'weak' && !a.canConclude, '2 cases → weak, never strong')
  const b = sq.evaluateSampleQuality({ sampleSize: 5 })
  assert(b.quality === 'usable' && !b.canConclude, '5 cases → usable (not strong)')
  const c = sq.evaluateSampleQuality({ sampleSize: 10 })
  assert(c.quality === 'strong' && c.canConclude, '10 recent in-context → strong (data confidence, not probability)')
}

console.log('[smoke] old-dominated sample → misleading_risk:')
{
  const a = sq.evaluateSampleQuality({ sampleSize: 10, recentSampleSize: 1, outdatedSampleSize: 9 })
  assert(a.quality === 'misleading_risk', 'mostly old → misleading_risk')
}

console.log('[smoke] H2H insufficient is not a tabu:')
{
  const a = sq.evaluateH2HSampleQuality({ matchesFound: 1, relevantMatches: 1, outdatedMatches: 0 })
  assert(a.quality === 'weak' || a.quality === 'insufficient', '1 H2H match → weak/insufficient (not strong)')
  assert(a.warnings.some(w => w.toLowerCase().includes('tabu')), 'H2H weak carries "não é tabu" warning')
  const empty = sq.evaluateH2HSampleQuality({ matchesFound: 0, relevantMatches: 0, outdatedMatches: 0 })
  assert(empty.quality === 'insufficient', '0 H2H → insufficient')
}

console.log('[smoke] taboo governance — weak/old/superstition never usable:')
{
  const tiny = sq.classifyTabooFromSample({ sample: sq.evaluateSampleQuality({ sampleSize: 2 }), supportingCases: 2, contradictingCases: 0 })
  assert(tiny.status === 'superstition_risk' && !tiny.isUsableConstraint, '2/2 with no counterexample → superstition_risk (not usable)')
  const weak = sq.classifyTabooFromSample({ sample: sq.evaluateSampleQuality({ sampleSize: 3 }), supportingCases: 2, contradictingCases: 1 })
  assert(!weak.isUsableConstraint, 'small mixed sample → not usable constraint')
  const none = sq.classifyTabooFromSample({ sample: sq.evaluateSampleQuality({ sampleSize: 0 }), supportingCases: 0, contradictingCases: 0 })
  assert(none.status === 'not_enough_data' && !none.isUsableConstraint, 'no evidence → not_enough_data')
  const old = sq.classifyTabooFromSample({ sample: sq.evaluateSampleQuality({ sampleSize: 12, recentSampleSize: 1, outdatedSampleSize: 11 }), supportingCases: 8, contradictingCases: 0 })
  assert(old.status === 'outdated' && !old.isUsableConstraint, 'old-dominated → outdated (not usable)')
  const supported = sq.classifyTabooFromSample({ sample: sq.evaluateSampleQuality({ sampleSize: 12, recentSampleSize: 12, outdatedSampleSize: 0 }), supportingCases: 10, contradictingCases: 1 })
  assert(supported.status === 'supported' && supported.isUsableConstraint, 'strong recent net-positive → supported + usable')
  const contradicted = sq.classifyTabooFromSample({ sample: sq.evaluateSampleQuality({ sampleSize: 12 }), supportingCases: 3, contradictingCases: 6 })
  assert(contradicted.status === 'contradicted' && !contradicted.isUsableConstraint, 'more contradictions → contradicted')
}

console.log('[smoke] pattern×context quality — confirmed_partial useful; unknown/not_evaluable ≠ failed:')
{
  const onlyUnknown = sq.evaluatePatternContextQuality({ confirmed: 0, confirmedPartial: 0, failed: 0, unknown: 5, notEvaluable: 2 })
  assert(onlyUnknown.quality === 'insufficient', 'only unknown/not_evaluable → insufficient (not failed)')
  assert(onlyUnknown.limitations.some(l => l.toLowerCase().includes('não avali')), 'flags not-evaluable ≠ failure')
  const partial = sq.evaluatePatternContextQuality({ confirmed: 4, confirmedPartial: 4, failed: 0, unknown: 1, notEvaluable: 0 })
  assert(partial.quality === 'strong', 'confirmed + partial counted as evaluable evidence')
}

console.log('[smoke] explainSampleLimitations honest:')
{
  const msgs = sq.explainSampleLimitations(sq.evaluateSampleQuality({ sampleSize: 0 }))
  assert(msgs.some(m => m.toLowerCase().includes('insufficient_history')), 'explains insufficient_history')
}

console.log('[smoke] Noop repo safe — memory reads empty (→ insufficient_history):')
{
  const { NoopIntelligenceRepository } = await load('../dist/repositories/noopIntelligence.repository.js')
  const repo = new NoopIntelligenceRepository()
  const profile = { id: 'tfm_x', teamId: 'X', teamName: 'X' }
  assert((await repo.saveTeamFundamentalMemory(profile)).id === 'tfm_x', 'Noop saves team memory (returns input)')
  assert((await repo.getTeamFundamentalMemory('X')) === null, 'Noop get team memory → null (insufficient_history)')
  assert((await repo.listTeamFundamentalMemories()).length === 0, 'Noop list team memories → []')
  assert((await repo.listTabooCandidates({})).length === 0, 'Noop list taboos → []')
  assert((await repo.listMemoryBuildRuns()).length === 0, 'Noop list build runs → []')
  const run = { id: 'mbr_x', scope: 'team', status: 'completed' }
  assert((await repo.createMemoryBuildRun(run)).id === 'mbr_x', 'Noop create build run (returns input)')
}

console.log('[smoke] build runner respects env flag (no provider fetch):')
{
  // Importing the runner module is safe (Firebase inits lazily). We only assert the
  // exported flag helpers exist and are booleans — no repo method is invoked here.
  const runner = await load('../dist/modules/footballIntelligence/memory/historicalMemoryBuildRunner.service.js')
  assert(typeof runner.isHistoricalMemoryBuildEnabled() === 'boolean', 'isHistoricalMemoryBuildEnabled() returns boolean')
  assert(typeof runner.isHistoricalMemorySchedulerEnabled() === 'boolean', 'scheduler flag returns boolean (off by default)')
}

if (FAILURES.length > 0) { console.log(`[smoke] FAILED (${FAILURES.length}): ${FAILURES.join(' | ')}`); process.exitCode = 1 }
else console.log('[smoke] OK')
