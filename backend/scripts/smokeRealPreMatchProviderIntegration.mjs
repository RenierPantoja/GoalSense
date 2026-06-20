/**
 * Smoke — Real Pre-Match Provider Integration + Manual Intake (B41). PURE + Noop.
 * ─────────────────────────────────────────────────────────────────────────────
 * Verifies, without touching network/Firebase: provider readiness (real/skeleton/
 * not_configured), provider-not-supported honesty, manual records tagged as manual
 * (never provider), merge precedence + conflict → requires_operator_review, and the
 * inviolable "absent ≠ zero" rules. Observe-first precheck. Noop-safe.
 *
 * Build first: npm run build
 * Usage: node scripts/smokeRealPreMatchProviderIntegration.mjs
 */
const FAILURES = []
function assert(c, m) { if (!c) { FAILURES.push(m); console.log(`  [FAIL] ${m}`) } else console.log(`  [ok] ${m}`) }
async function load(p) { try { return await import(p) } catch (e) { console.error(`Could not import ${p}. Run \`npm run build\` first.`); console.error(e?.message || e); process.exit(1) } }

const readiness = await load('../dist/modules/footballIntelligence/providerIntegrationReadiness.service.js')
const merge = await load('../dist/modules/footballIntelligence/preMatchDataMerge.service.js')
const intake = await load('../dist/modules/footballIntelligence/manualIntelligenceIntake.service.js')
const espnAdapter = await load('../dist/modules/footballIntelligence/providers/adapters/espnFootballProvider.adapter.js')
const apiFootball = await load('../dist/modules/footballIntelligence/providers/adapters/apiFootballProvider.adapter.js')
const pre = await load('../dist/modules/footballIntelligence/alertDecisionPrecheck.service.js')

console.log('[smoke] provider integration readiness:')
{
  const rep = readiness.buildProviderIntegrationReadiness()
  const espn = rep.providers.find(p => p.providerName === 'espn')
  assert(espn?.adapterStatus === 'real', 'ESPN adapterStatus = real')
  const af = rep.providers.find(p => p.providerName === 'api_football')
  assert(af && (af.adapterStatus === 'not_configured' || af.adapterStatus === 'disabled'), 'api_football not configured/disabled by default')
  assert(af.missingEnvVars.length > 0, 'api_football lists missing env vars')
  assert(af.blockedDomains.includes('injuries'), 'api_football injuries listed as blocked (id mapping)')
  const sm = rep.providers.find(p => p.providerName === 'sportmonks')
  assert(sm?.adapterStatus === 'not_configured', 'sportmonks not_configured (no env/code)')
}

console.log('[smoke] ESPN adapter — honest about what it does NOT cover:')
{
  const espn = new espnAdapter.EspnFootballProviderAdapter()
  const inj = await espn.fetchDomain('injuries', { fixtureId: 'f1' })
  assert(inj.availability === 'provider_not_supported', 'ESPN injuries → provider_not_supported')
  const lin = await espn.fetchDomain('confirmed_lineups', { fixtureId: 'f1' })
  assert(lin.availability === 'provider_not_supported', 'ESPN confirmed_lineups → provider_not_supported')
}

console.log('[smoke] API-Football — never called without env; blocked domains honest:')
{
  const af = new apiFootball.ApiFootballProviderAdapter()
  const inj = await af.fetchDomain('injuries', { fixtureId: 'f1' })
  assert(inj.availability === 'provider_not_configured', 'api_football injuries (no env) → provider_not_configured (not called)')
  assert(inj.canonicalData === null, 'api_football injuries returns null (NOT empty "no injuries")')
}

console.log('[smoke] manual intake — tagged manual, never provider:')
{
  const rec = intake.buildManualRecord({ fixtureId: 'f1', domain: 'injury', sourceType: 'manual_operator', sourceLabel: 'op', payload: { playerName: 'X', reason: 'lesão' } })
  assert(rec.id.startsWith('mir_'), 'manual record id namespaced mir_')
  assert(rec.sourceType === 'manual_operator', 'manual injury tagged sourceType=manual_operator (not provider)')
  assert(rec.reliability === 'unknown', 'manual_operator default reliability = unknown')
  assert(Array.isArray(rec.audit) && rec.audit[0].action === 'created', 'manual record has audit trail')
  const official = intake.buildManualRecord({ fixtureId: 'f1', domain: 'lineup', sourceType: 'official_club', sourceLabel: 'site oficial' })
  assert(official.reliability === 'high', 'official_club default reliability = high')
}

console.log('[smoke] merge precedence + conflict → requires_operator_review:')
{
  const providerSnap = { provider: 'api_football', availability: 'available', dataQuality: 'partial' }
  const highManual = [{ reliability: 'high', sourceType: 'official_club', domain: 'injury' }]
  const conflict = merge.mergeDomain('injuries', providerSnap, highManual)
  assert(conflict.conflict === true && conflict.requiresOperatorReview === true, 'usable provider + high manual → conflict requires review (not silent)')

  const manualOnly = merge.mergeDomain('injuries', null, [{ reliability: 'high', sourceType: 'official_club', domain: 'injury' }])
  assert(manualOnly.chosenSource === 'manual' && manualOnly.chosenReliability === 'high', 'manual high used when no provider')

  const none = merge.mergeDomain('injuries', null, [])
  assert(none.chosenSource === 'none', 'no provider + no manual → none')
  assert(none.limitations.join(' ').toLowerCase().includes('sem dado'), 'injuries with no data → "sem dado" (NOT "no injuries")')

  const lowOnly = merge.mergeDomain('suspensions', null, [{ reliability: 'low', sourceType: 'other', domain: 'suspension' }])
  assert(lowOnly.chosenReliability === 'low', 'low manual used only as caution')
}

console.log('[smoke] precheck observe-first (V1/V2/V3 share the mode):')
{
  assert(pre.precheckMode() === 'observe', 'precheck mode = observe by default')
  assert(pre.isPrecheckEnabled() === false, 'precheck disabled by default (never blocks real alerts)')
}

console.log('[smoke] Noop adapter B41 manual store safety:')
{
  const { NoopIntelligenceRepository } = await load('../dist/repositories/noopIntelligence.repository.js')
  const repo = new NoopIntelligenceRepository()
  assert((await repo.saveManualIntelligenceRecord({ id: 'mir_x' })).id === 'mir_x', 'Noop save manual returns input')
  assert((await repo.getManualIntelligenceRecord('mir_x')) === null, 'Noop get manual → null')
  assert((await repo.listManualIntelligenceRecords({ fixtureId: 'f1' })).length === 0, 'Noop list manual → []')
  assert((await repo.deleteManualIntelligenceRecord('mir_x')).count === 0, 'Noop delete manual → count 0')
}

if (FAILURES.length > 0) { console.log(`[smoke] FAILED (${FAILURES.length}): ${FAILURES.join(' | ')}`); process.exitCode = 1 }
else console.log('[smoke] OK')
