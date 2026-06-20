/**
 * Smoke — Team/Competition Identity Mapping + Domain Unlock (B43). PURE + Noop.
 * ─────────────────────────────────────────────────────────────────────────────
 * Verifies, offline: entity mappings are derived from fixture co-occurrence (never
 * name-only), divergence → ambiguous, below threshold → candidate; the bridge blocks
 * cleanly without a configured provider; API-Football is never called without env;
 * Noop-safe. Absent ≠ zero.
 *
 * Build first: npm run build
 * Usage: node scripts/smokeTeamCompetitionIdentityMapping.mjs
 */
const FAILURES = []
function assert(c, m) { if (!c) { FAILURES.push(m); console.log(`  [FAIL] ${m}`) } else console.log(`  [ok] ${m}`) }
async function load(p) { try { return await import(p) } catch (e) { console.error(`Could not import ${p}. Run \`npm run build\` first.`); console.error(e?.message || e); process.exit(1) } }

const der = await load('../dist/modules/footballIntelligence/identity/providerEntityMappingDerivation.service.js')
const bridge = await load('../dist/modules/footballIntelligence/identity/providerBridge.service.js')
const apiFootball = await load('../dist/modules/footballIntelligence/providers/adapters/apiFootballProvider.adapter.js')

const OPTS = { minFixtures: 2, autoConfirm: true }

console.log('[smoke] team mapping derivation from fixture evidence:')
{
  // Same ESPN team → same API id across 2 fixtures → auto_confirmed.
  const pairs = [
    { espnTeamName: 'Palmeiras', apiTeamId: '121', apiTeamName: 'Palmeiras', fixtureId: 'f1', country: 'Brazil' },
    { espnTeamName: 'Palmeiras', apiTeamId: '121', apiTeamName: 'Palmeiras', fixtureId: 'f2', country: 'Brazil' },
  ]
  const maps = der.deriveTeamMappingsFromPairs(pairs, OPTS)
  assert(maps.length === 1 && maps[0].status === 'auto_confirmed', 'same id across ≥2 fixtures → auto_confirmed')
  assert(maps[0].secondaryProviderTeamId === '121', 'auto_confirmed carries the external team id')
  assert(maps[0].strength === 'fixture_derived', 'strength = fixture_derived (not name-only)')

  // Single fixture → candidate (needs manual confirm).
  const single = der.deriveTeamMappingsFromPairs([{ espnTeamName: 'Santos', apiTeamId: '128', apiTeamName: 'Santos', fixtureId: 'f1', country: 'Brazil' }], OPTS)
  assert(single[0].status === 'candidate', 'single confirmed fixture → candidate (not auto)')

  // Same ESPN team → two different API ids → ambiguous.
  const amb = der.deriveTeamMappingsFromPairs([
    { espnTeamName: 'America', apiTeamId: '133', apiTeamName: 'America MG', fixtureId: 'f1', country: 'Brazil' },
    { espnTeamName: 'America', apiTeamId: '999', apiTeamName: 'America RJ', fixtureId: 'f2', country: 'Brazil' },
  ], OPTS)
  assert(amb[0].status === 'ambiguous', 'multiple external ids for same ESPN team → ambiguous')
  assert(amb[0].secondaryProviderTeamId === null, 'ambiguous mapping exposes no external id')

  // Name-only (no apiTeamId) → not derived.
  const nameOnly = der.deriveTeamMappingsFromPairs([{ espnTeamName: 'Flamengo', apiTeamId: null, apiTeamName: 'Flamengo', fixtureId: 'f1', country: 'Brazil' }], OPTS)
  assert(nameOnly.length === 0, 'name-only (no external id) → no mapping derived')
}

console.log('[smoke] competition mapping derivation:')
{
  const maps = der.deriveCompetitionMappingsFromPairs([
    { espnCompetition: 'Brasileirao Serie A', apiLeagueId: '71', apiCompetitionName: 'Serie A', season: '2026', country: 'Brazil', fixtureId: 'f1' },
    { espnCompetition: 'Brasileirao Serie A', apiLeagueId: '71', apiCompetitionName: 'Serie A', season: '2026', country: 'Brazil', fixtureId: 'f2' },
  ], OPTS)
  assert(maps[0].status === 'auto_confirmed' && maps[0].secondaryProviderCompetitionId === '71', 'consistent league id ≥2 fixtures → auto_confirmed')
  assert(maps[0].season === '2026', 'competition mapping carries season')
}

console.log('[smoke] provider bridge — blocks without configured provider (no network):')
{
  for (const d of ['standings', 'injuries', 'suspensions', 'head_to_head']) {
    const s = await bridge.getDomainUnlockStatus('f1', d, 'api_football')
    assert(s.currentStatus === 'blocked_provider_not_configured', `${d} → blocked_provider_not_configured (provider sem env não chamado)`)
  }
  const v2 = await bridge.canFetchDomainForFixtureV2('f1', 'injuries', 'api_football')
  assert(v2.allow === false, 'canFetchDomainForFixtureV2 injuries → not allowed without provider/mapping')
}

console.log('[smoke] API-Football never called without env (standings/injuries):')
{
  const af = new apiFootball.ApiFootballProviderAdapter()
  const st = await af.fetchDomain('standings', { fixtureId: 'f1', resolvedLeagueId: '71', resolvedSeason: '2026' })
  assert(st.availability === 'provider_not_configured', 'standings without env → provider_not_configured (not called)')
  const inj = await af.fetchDomain('injuries', { fixtureId: 'f1', resolvedHomeTeamId: '121', resolvedAwayTeamId: '128' })
  assert(inj.availability === 'provider_not_configured', 'injuries without env → provider_not_configured (not called)')
}

console.log('[smoke] Noop adapter B43 entity store safety:')
{
  const { NoopIntelligenceRepository } = await load('../dist/repositories/noopIntelligence.repository.js')
  const repo = new NoopIntelligenceRepository()
  assert((await repo.saveProviderTeamMapping({ id: 'ptm_x' })).id === 'ptm_x', 'Noop save team mapping returns input')
  assert((await repo.getProviderTeamMapping('ptm_x')) === null, 'Noop get team mapping → null (→ bridge blocks)')
  assert((await repo.listProviderTeamMappings()).length === 0, 'Noop list team mappings → []')
  assert((await repo.listProviderCompetitionMappings()).length === 0, 'Noop list competition mappings → []')
  assert((await repo.listEntityMappingDerivationRuns()).length === 0, 'Noop list derivation runs → []')
  assert((await repo.updateProviderTeamMappingStatus('ptm_x', { status: 'rejected' })).count === 0, 'Noop update team mapping → count 0')
}

if (FAILURES.length > 0) { console.log(`[smoke] FAILED (${FAILURES.length}): ${FAILURES.join(' | ')}`); process.exitCode = 1 }
else console.log('[smoke] OK')
