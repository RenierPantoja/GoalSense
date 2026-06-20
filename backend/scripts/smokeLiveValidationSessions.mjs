/**
 * Smoke test — Live Validation Sessions (Phase B37). PURE core + Noop safety.
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests the env-free report logic (recommendations, go/no-go) and asserts the
 * Noop intelligence adapter is safe for the new B37 methods. Honest: coverage
 * absent / unknown / not_evaluable are NEVER failures.
 *
 * Build first: npm run build
 * Usage: node scripts/smokeLiveValidationSessions.mjs
 */
const FAILURES = []
function assert(c, m) { if (!c) { FAILURES.push(m); console.log(`  [FAIL] ${m}`) } else console.log(`  [ok] ${m}`) }
async function load(p) { try { return await import(p) } catch (e) { console.error(`Could not import ${p}. Run \`npm run build\` first.`); console.error(e?.message || e); process.exit(1) } }

const u = await load('../dist/modules/validation/utils/liveValidationReport.util.js')

function summary(over) {
  return {
    fixturesPlanned: 3, fixturesObserved: 3, fixturesSkipped: 0, snapshotsWritten: 20, snapshotsSkipped: 5,
    providerCallsAllowed: 30, providerCallsBlocked: 0, signalsCreated: 4, alertsCreated: 2, opportunitiesCreated: 3,
    outcomesResolved: 1, exactEvidenceLinks: 2, inferredEvidenceLinks: 1, unknownOutcomes: 0, notEvaluable: 0,
    dataQualityBreakdown: { rich: 2, partial: 1, poor: 0, unknown: 0 }, operationalRisk: 'low', recommendations: [], limitations: [], ...over,
  }
}

console.log('[smoke] recommendations are cautious + honest:')
{
  const empty = u.buildRecommendations(summary({ fixturesObserved: 0, signalsCreated: 0, alertsCreated: 0, opportunitiesCreated: 0 }))
  assert(empty.some(r => /cobertura ausente/i.test(r)), 'no fixtures → coverage-absent recommendation (not failure)')
  const blocked = u.buildRecommendations(summary({ providerCallsBlocked: 3 }))
  assert(blocked.some(r => /orçamento de provider/i.test(r)), 'provider blocked → reduce fixtures/raise interval')
  const all = u.buildRecommendations(summary()).join(' ')
  assert(!/lucro|aposta|stake|odds|garantid/i.test(all), 'recommendations never mention profit/bet/stake/odds')
  const poor = u.buildRecommendations(summary({ dataQualityBreakdown: { rich: 0, partial: 0, poor: 3, unknown: 2 } }))
  assert(poor.some(r => /baixa cobertura/i.test(r)), 'poor/unknown majority → low coverage recommendation')
}

console.log('[smoke] go/no-go honesty:')
{
  assert(u.deriveGoNoGo(summary()) === 'go', 'healthy session → go')
  assert(u.deriveGoNoGo(summary({ fixturesObserved: 0, signalsCreated: 0, alertsCreated: 0, opportunitiesCreated: 0 })) === 'insufficient_data', 'no data → insufficient_data (not no_go)')
  assert(u.deriveGoNoGo(summary({ operationalRisk: 'unsafe' })) === 'no_go', 'unsafe risk → no_go')
  assert(u.deriveGoNoGo(summary({ providerCallsBlocked: 1 })) === 'go_with_limitations', 'provider blocked → go_with_limitations')
}

console.log('[smoke] evidence breakdown clamps negatives:')
{
  const e = u.evidenceBreakdown(2, -1, 0)
  assert(e.exact === 2 && e.inferred === 0 && e.unknown === 0, 'negatives clamped to 0')
}

console.log('[smoke] Noop adapter B37 safety (prisma fallback):')
{
  const { NoopIntelligenceRepository } = await load('../dist/repositories/noopIntelligence.repository.js')
  const repo = new NoopIntelligenceRepository()
  const s = { id: 'lvs_x', name: 'S', status: 'draft' }
  assert((await repo.createLiveValidationSession(s)).id === 'lvs_x', 'Noop createSession returns input')
  assert((await repo.updateLiveValidationSession()).count === 0, 'Noop update → 0')
  assert((await repo.getLiveValidationSession()) === null, 'Noop get → null')
  assert((await repo.listLiveValidationSessions()).length === 0, 'Noop list → []')
  assert((await repo.listLiveValidationSessionFixtures()).length === 0, 'Noop fixtures → []')
  assert((await repo.listLiveValidationSessionEvents()).length === 0, 'Noop events → []')
  assert((await repo.getLiveValidationSessionReport()) === null, 'Noop report → null')
}

if (FAILURES.length > 0) { console.log(`[smoke] FAILED (${FAILURES.length}): ${FAILURES.join(' | ')}`); process.exitCode = 1 }
else console.log('[smoke] OK')
