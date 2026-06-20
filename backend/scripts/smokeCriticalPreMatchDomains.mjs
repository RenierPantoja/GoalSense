/**
 * Smoke — Critical Pre-Match Domains + Endpoint Catalog (B44 / Bloco 1). PURE + Noop.
 * ─────────────────────────────────────────────────────────────────────────────
 * Verifies, offline: the endpoint catalog blocks undocumented endpoints and missing
 * env/ids; canonical normalization keeps "empty only when confirmed" and never turns
 * absence into zero; ESPN is honest about unsupported domains; API-Football is never
 * called without env; precheck stays observe; Noop-safe.
 *
 * Build first: npm run build
 * Usage: node scripts/smokeCriticalPreMatchDomains.mjs
 */
const FAILURES = []
function assert(c, m) { if (!c) { FAILURES.push(m); console.log(`  [FAIL] ${m}`) } else console.log(`  [ok] ${m}`) }
async function load(p) { try { return await import(p) } catch (e) { console.error(`Could not import ${p}. Run \`npm run build\` first.`); console.error(e?.message || e); process.exit(1) } }

const cat = await load('../dist/modules/footballIntelligence/providers/providerEndpointCatalog.service.js')
const norm = await load('../dist/modules/footballIntelligence/canonicalNormalizer.service.js')
const espnAdapter = await load('../dist/modules/footballIntelligence/providers/adapters/espnFootballProvider.adapter.js')
const apiFootball = await load('../dist/modules/footballIntelligence/providers/adapters/apiFootballProvider.adapter.js')
const pre = await load('../dist/modules/footballIntelligence/alertDecisionPrecheck.service.js')

console.log('[smoke] provider endpoint catalog:')
{
  const all = cat.listProviderEndpointCatalog()
  assert(all.length >= 10, 'catalog lists provider/domain endpoints')
  const espnToday = cat.getEndpointForDomain('espn', 'today_fixtures')
  assert(espnToday && espnToday.safetyStatus === 'safe_to_call', 'ESPN today_fixtures → safe_to_call (no key)')
  // Undocumented endpoint never callable.
  const susp = cat.canCallEndpoint('api_football', 'suspensions', { homeTeamId: '1', awayTeamId: '2' })
  assert(susp.callable === false && susp.safetyStatus === 'blocked_not_documented', 'suspensions → blocked_not_documented (no guessing)')
  const h2h = cat.canCallEndpoint('api_football', 'head_to_head', {})
  assert(h2h.safetyStatus === 'blocked_not_documented', 'head_to_head → blocked_not_documented')
  // Documented but no env.
  const inj = cat.canCallEndpoint('api_football', 'injuries', { homeTeamId: '1', awayTeamId: '2', season: '2026' })
  assert(inj.safetyStatus === 'blocked_missing_env', 'injuries with ids but no env → blocked_missing_env (provider sem env não chamado)')
  // Documented, env-less still blocked_missing_env before ids checked.
  const st = cat.canCallEndpoint('api_football', 'standings', {})
  assert(st.callable === false, 'standings without env/ids → not callable')
}

console.log('[smoke] canonical normalization — empty only when confirmed; absent ≠ zero:')
{
  const emptyConfirmed = norm.normalizeDomainResult({ domain: 'injuries', provider: 'api_football', availability: 'available_empty_confirmed', freshness: 'fresh', dataQuality: 'poor', fetchedAt: new Date().toISOString(), canonicalData: { homeInjuries: 0, awayInjuries: 0 }, payloadSummary: 'sem lesões (confirmado)', reasons: [], limitations: [], providerCandidatesTried: [] })
  assert(emptyConfirmed.confirmedEmpty === true && emptyConfirmed.source === 'provider', 'available_empty_confirmed → confirmedEmpty + provider source')
  assert(norm.isUsable({ availability: 'available_empty_confirmed' }) === true, 'confirmed-empty is usable')

  const absent = norm.normalizeDomainResult({ domain: 'injuries', provider: 'api_football', availability: 'provider_not_configured', freshness: 'unknown', dataQuality: 'unavailable', fetchedAt: new Date().toISOString(), canonicalData: null, payloadSummary: '', reasons: [], limitations: [], providerCandidatesTried: [] })
  assert(absent.confirmedEmpty === false && absent.source === 'none', 'absent injuries → NOT confirmedEmpty, source none (não vira "sem lesão")')
  assert(norm.isUsable({ availability: 'provider_not_configured' }) === false, 'absent is not usable')
}

console.log('[smoke] ESPN honest about unsupported domains:')
{
  const espn = new espnAdapter.EspnFootballProviderAdapter()
  const st = await espn.fetchDomain('standings', { fixtureId: 'f1' })
  assert(st.availability === 'provider_not_supported', 'ESPN standings → provider_not_supported (not empty data)')
}

console.log('[smoke] API-Football never called without env:')
{
  const af = new apiFootball.ApiFootballProviderAdapter()
  for (const d of ['standings', 'injuries', 'confirmed_lineups', 'fixture_details']) {
    const r = await af.fetchDomain(d, { fixtureId: 'f1', resolvedLeagueId: '71', resolvedSeason: '2026', resolvedHomeTeamId: '1', resolvedAwayTeamId: '2', resolvedExternalFixtureId: '999' })
    assert(r.availability === 'provider_not_configured', `${d} without env → provider_not_configured (not called)`)
  }
}

console.log('[smoke] precheck observe-first (V1..V5 share mode):')
{
  assert(pre.precheckMode() === 'observe', 'precheck mode = observe by default')
  assert(pre.isPrecheckEnabled() === false, 'precheck disabled by default (never blocks real alerts)')
}

console.log('[smoke] Noop adapter B44 snapshot store V2 fields:')
{
  const { NoopIntelligenceRepository } = await load('../dist/repositories/noopIntelligence.repository.js')
  const repo = new NoopIntelligenceRepository()
  const snap = { id: 'pms_x', domain: 'injuries', confirmedEmpty: false, idsResolved: {}, providerEndpointKey: null, reliability: 'unknown' }
  assert((await repo.savePreMatchDomainSnapshot(snap)).id === 'pms_x', 'Noop saves snapshot with V2 fields (returns input)')
  assert((await repo.listPreMatchDomainSnapshots('f1')).length === 0, 'Noop list snapshots → []')
}

if (FAILURES.length > 0) { console.log(`[smoke] FAILED (${FAILURES.length}): ${FAILURES.join(' | ')}`); process.exitCode = 1 }
else console.log('[smoke] OK')
