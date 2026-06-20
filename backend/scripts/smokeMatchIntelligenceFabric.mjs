/**
 * Smoke — Match Intelligence Fabric (B39 fundamental engine). PURE core + Noop safety.
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests the honest decision logic without touching providers or Firebase:
 * capability matrix, decision-input separation, precheck (observe-first), and the
 * inviolable "absent ≠ zero" semantics. unknown/not_evaluable never become failures.
 *
 * Build first: npm run build
 * Usage: node scripts/smokeMatchIntelligenceFabric.mjs
 */
const FAILURES = []
function assert(c, m) { if (!c) { FAILURES.push(m); console.log(`  [FAIL] ${m}`) } else console.log(`  [ok] ${m}`) }
async function load(p) { try { return await import(p) } catch (e) { console.error(`Could not import ${p}. Run \`npm run build\` first.`); console.error(e?.message || e); process.exit(1) } }

const cap = await load('../dist/modules/footballIntelligence/providerCapability.service.js')
const ctx = await load('../dist/modules/command/matchContext.service.js')
const dil = await load('../dist/modules/footballIntelligence/decisionInputLedger.service.js')
const pre = await load('../dist/modules/footballIntelligence/alertDecisionPrecheck.service.js')

console.log('[smoke] provider capability matrix:')
{
  const caps = cap.getProviderCapabilities('espn')
  assert(Object.keys(caps.domains).length >= 25, 'capability matrix returns many domains')
  assert(caps.domains.fixtures.coverage === 'full', 'fixtures = full coverage')
  assert(caps.domains.odds.coverage === 'not_used', 'odds = not_used (by design)')
  assert(caps.domains.injuries.coverage === 'unavailable', 'injuries = unavailable (not collected by backend)')
  assert(caps.domains.lineups.coverage === 'unavailable', 'lineups = unavailable')
  assert(cap.canAnalyzeDomain('odds').canAnalyze === false, 'odds not analyzable (not_used)')
  assert(cap.canAnalyzeDomain('fixtures').canAnalyze === true, 'fixtures analyzable')
  assert(cap.explainMissingCapability('injuries') !== null, 'missing injuries explained honestly')
  assert(cap.explainMissingCapability('fixtures') === null, 'present domain has no missing-explanation')
  // Unknown provider must not throw.
  const unknown = cap.getProviderCapabilities('does-not-exist')
  assert(unknown.limitations.length > 0, 'unknown provider returns matrix + limitation (no throw)')
}

console.log('[smoke] match context — unknown ≠ invented classic/final:')
{
  const u = ctx.deriveMatchContext('')
  assert(u.competitionType === 'unknown', 'empty competition → unknown type')
  assert(u.stage !== 'final', 'unknown competition is NOT a final')
  assert(u.isKnockout === false, 'unknown competition is NOT knockout')
  const league = ctx.deriveMatchContext('Brasileirão Série A')
  assert(league.competitionType === 'league', 'league detected')
  assert(league.isKnockout === false, 'league is not knockout')
  const fin = ctx.deriveMatchContext('Copa do Brasil - Final')
  assert(fin.stage === 'final' && fin.isKnockout === true, 'explicit final detected as knockout final')
}

console.log('[smoke] decision inputs — separation + absent ≠ zero:')
{
  const bundle = dil.buildDecisionInputs({
    fixtureId: 'f1',
    context: { fixtureId: 'f1', importanceLevel: 'high', volatilityRisk: 'high', competitionContext: { isKnockout: true }, importance: {}, limitations: [] },
    squad: { fixtureId: 'f1', lineupStatus: 'not_available_yet', minutesToKickoff: 120, waitForLineupRecommended: true, limitations: ['x'] },
    memoryHome: { teamName: 'A', sampleSize: 0, sampleQuality: 'insufficient', patternsConfirmed: 0, patternsFailed: 0, limitations: ['no history'] },
    memoryAway: { teamName: 'B', sampleSize: 20, sampleQuality: 'moderate', patternsConfirmed: 12, patternsFailed: 3, limitations: [] },
    h2h: { h2hReliability: 'insufficient_data', relevantMatches: 0, warnings: [], limitations: ['no h2h'] },
    tactical: { basis: 'none', expectedTempo: 'unknown', cardRisk: 'unknown' },
    readiness: { status: 'wait_for_lineup', missingCriticalData: [], missingOptionalData: [], waitReasons: [] },
  })
  assert(Array.isArray(bundle.positive) && Array.isArray(bundle.negative) && Array.isArray(bundle.uncertain), 'bundle splits positive/negative/uncertain')
  const injuries = bundle.all.find(d => d.variableKey === 'injuries')
  assert(injuries && injuries.value === 'unknown', 'injuries recorded as unknown (NOT "no injury")')
  const susp = bundle.all.find(d => d.variableKey === 'suspensions')
  assert(susp && susp.value === 'unknown', 'suspensions recorded as unknown (NOT "no suspension")')
  const lineup = bundle.all.find(d => d.variableKey === 'lineup_pending')
  assert(lineup && lineup.direction === 'blocking', 'pending lineup is a blocking input (wait, not empty lineup)')
  const h2h = bundle.all.find(d => d.variableKey === 'head_to_head')
  assert(h2h && h2h.value === 'insufficient_data', 'insufficient H2H is insufficient_data (NOT tabu)')
  const memHome = bundle.all.find(d => d.variableKey === 'memory_home')
  assert(memHome && memHome.value === 'insufficient_history', 'empty memory → insufficient_history (not negative)')
}

console.log('[smoke] alert precheck — observe-first, honest decisions:')
{
  assert(pre.precheckMode() === 'observe', 'precheck default mode = observe')
  assert(pre.isPrecheckEnabled() === false, 'precheck disabled by default (never blocks real alerts)')

  const base = (over) => ({
    fixtureId: 'f1', phase: 'pre_match',
    readiness: { status: 'partially_ready', missingCriticalData: [], waitReasons: [] },
    squads: { waitForLineupRecommended: false },
    live: { hasStats: true }, context: { volatilityRisk: 'low' }, stayOutReasons: [],
    ...over,
  })

  const waitLineup = pre.evaluatePrecheckFromPackage(base({ squads: { waitForLineupRecommended: true } }))
  assert(waitLineup.decision === 'wait_for_lineup', 'pending lineup → wait_for_lineup (not empty alert)')

  const liveNoStats = pre.evaluatePrecheckFromPackage(base({ phase: 'live', live: { hasStats: false } }))
  assert(liveNoStats.decision === 'wait_for_live_confirmation', 'live without stats → wait_for_live_confirmation')

  const blocked = pre.evaluatePrecheckFromPackage(base({ readiness: { status: 'partially_ready', missingCriticalData: ['stats ao vivo'], waitReasons: [] } }))
  assert(blocked.decision === 'block_alert', 'critical data missing → block_alert')

  const postMatch = pre.evaluatePrecheckFromPackage(base({ phase: 'post_match' }))
  assert(postMatch.decision === 'post_match_only', 'finished match → post_match_only')

  const volatile = pre.evaluatePrecheckFromPackage(base({ context: { volatilityRisk: 'high' } }))
  assert(volatile.decision === 'downgrade_to_monitor', 'high volatility → downgrade_to_monitor')

  const ok = pre.evaluatePrecheckFromPackage(base({}))
  assert(ok.decision === 'allow_alert', 'clean fundamentals → allow_alert (final engine gates still apply)')
}

console.log('[smoke] Noop adapter safety (prisma fallback):')
{
  const { NoopIntelligenceRepository } = await load('../dist/repositories/noopIntelligence.repository.js')
  const repo = new NoopIntelligenceRepository()
  assert((await repo.listAllSignalLedgerEntries()).length === 0, 'Noop signal ledger → [] (insufficient_history, not negative)')
  assert((await repo.listAllAlertOutcomes()).length === 0, 'Noop outcomes → []')
}

if (FAILURES.length > 0) { console.log(`[smoke] FAILED (${FAILURES.length}): ${FAILURES.join(' | ')}`); process.exitCode = 1 }
else console.log('[smoke] OK')
