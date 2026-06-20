/**
 * Smoke — Cross-Provider Fixture Identity Resolution (B42). PURE + Noop.
 * ─────────────────────────────────────────────────────────────────────────────
 * Verifies, offline: normalization keeps identity, high confidence ONLY when
 * home/away/date/kickoff align, name-only never high, large kickoff delta / swapped
 * caps the band, fingerprint deterministic, bridge blocks without a confirmed mapping,
 * and provider-without-env is never called. Noop-safe.
 *
 * Build first: npm run build
 * Usage: node scripts/smokeCrossProviderIdentityResolution.mjs
 */
const FAILURES = []
function assert(c, m) { if (!c) { FAILURES.push(m); console.log(`  [FAIL] ${m}`) } else console.log(`  [ok] ${m}`) }
async function load(p) { try { return await import(p) } catch (e) { console.error(`Could not import ${p}. Run \`npm run build\` first.`); console.error(e?.message || e); process.exit(1) } }

const u = await load('../dist/modules/footballIntelligence/identity/providerIdentity.util.js')
const bridge = await load('../dist/modules/footballIntelligence/identity/providerBridge.service.js')
const apiFootball = await load('../dist/modules/footballIntelligence/providers/adapters/apiFootballProvider.adapter.js')

const OPTS = { highThreshold: 0.88, mediumThreshold: 0.70, maxKickoffDeltaMinutes: 120, requireCompetitionMatch: false }

console.log('[smoke] normalization keeps identity, removes noise:')
{
  assert(u.normalizeTeamName('São Paulo FC') === 'sao paulo', 'team noise (FC) + accents removed, core kept')
  assert(u.normalizeTeamName('Manchester United') === 'manchester united', 'multi-word identity kept')
  assert(u.normalizeTeamName('FC') !== '', 'all-noise name does not vanish to empty')
  assert(u.compareTeamNames('São Paulo FC', 'Sao Paulo') === 1, 'same team after normalization → 1.0')
  assert(u.compareTeamNames('Flamengo', 'Fluminense') < 0.6, 'different teams → low similarity')
}

console.log('[smoke] scoring — high ONLY when aligned; name-only never high:')
{
  const same = { home: 'Palmeiras', away: 'Corinthians', competition: 'Brasileirao Serie A', country: 'Brazil', kickoff: '2026-06-20T20:00:00Z' }
  const af = { home: 'Palmeiras', away: 'Corinthians', competition: 'Serie A', country: 'Brazil', kickoff: '2026-06-20T20:05:00Z' }
  const c1 = u.scoreFixtureCandidate(same, af)
  assert(u.classifyCandidateScore(c1, OPTS) === 'high', 'aligned home/away/date/kickoff → high')

  const nameOnly = { home: 'Palmeiras', away: 'Corinthians', competition: 'Serie A', country: 'Brazil', kickoff: null }
  const c2 = u.scoreFixtureCandidate({ ...same, kickoff: null }, nameOnly)
  assert(u.classifyCandidateScore(c2, OPTS) !== 'high', 'name-only (no date/kickoff) → never high')

  const diffDay = { ...af, kickoff: '2026-06-25T20:00:00Z' }
  const c3 = u.scoreFixtureCandidate(same, diffDay)
  assert(u.classifyCandidateScore(c3, OPTS) !== 'high', 'different day → not high')

  const highDelta = { ...af, kickoff: '2026-06-20T23:30:00Z' }
  const c4 = u.scoreFixtureCandidate(same, highDelta)
  assert(c4.kickoffDeltaMinutes > 120, 'kickoff delta computed (>120)')
  assert(u.classifyCandidateScore(c4, OPTS) !== 'high', 'kickoff delta > max → capped below high')
}

console.log('[smoke] swapped home/away detection:')
{
  const primary = { home: 'Real Madrid', away: 'Barcelona', competition: 'La Liga', country: 'Spain', kickoff: '2026-06-20T20:00:00Z' }
  const swapped = { home: 'Barcelona', away: 'Real Madrid', competition: 'La Liga', country: 'Spain', kickoff: '2026-06-20T20:00:00Z' }
  assert(u.detectSwappedHomeAway(primary, swapped) === true, 'swapped home/away detected')
  const c = u.scoreFixtureCandidate(primary, swapped)
  assert(u.classifyCandidateScore(c, OPTS) !== 'high', 'swapped → not auto high')
}

console.log('[smoke] fingerprint deterministic:')
{
  const a = u.buildFixtureIdentityFingerprint({ primaryProvider: 'espn', primaryFixtureId: 'e1', secondaryProvider: 'api_football', secondaryProviderFixtureId: 'a1' })
  const b = u.buildFixtureIdentityFingerprint({ primaryProvider: 'espn', primaryFixtureId: 'e1', secondaryProvider: 'api_football', secondaryProviderFixtureId: 'a1' })
  assert(a === b && a.startsWith('fid_'), 'fingerprint deterministic + namespaced')
  const c = u.buildFixtureIdentityFingerprint({ primaryProvider: 'espn', primaryFixtureId: 'e1', secondaryProvider: 'api_football', secondaryProviderFixtureId: 'a2' })
  assert(a !== c, 'different secondary id → different fingerprint')
}

console.log('[smoke] provider bridge — non-fixture domain needs no mapping:')
{
  const r = await bridge.canFetchDomainForFixture('f1', 'standings', 'api_football')
  assert(r.decision === 'not_a_fixture_domain', 'standings does not depend on fixture mapping')
}

console.log('[smoke] API-Football never called without env:')
{
  const af = new apiFootball.ApiFootballProviderAdapter()
  const today = await af.fetchDomain('today_fixtures', { date: '2026-06-20' })
  assert(today.availability === 'provider_not_configured', 'today_fixtures without env → provider_not_configured (not called)')
  const inj = await af.fetchDomain('injuries', { fixtureId: 'f1' })
  assert(inj.availability === 'provider_not_configured', 'injuries without env → provider_not_configured')
}

console.log('[smoke] Noop adapter B42 identity store safety (blocks without mapping):')
{
  const { NoopIntelligenceRepository } = await load('../dist/repositories/noopIntelligence.repository.js')
  const repo = new NoopIntelligenceRepository()
  assert((await repo.saveProviderEntityMapping({ id: 'pem_x' })).id === 'pem_x', 'Noop save mapping returns input')
  assert((await repo.getProviderEntityMapping('pem_x')) === null, 'Noop get mapping → null')
  assert((await repo.listProviderMappingsForEntity('fixture', 'f1')).length === 0, 'Noop list mappings for entity → [] (→ bridge blocks missing)')
  assert((await repo.listProviderMappingsByStatus('ambiguous')).length === 0, 'Noop list by status → []')
  assert((await repo.listFixtureIdentityResolutionRuns()).length === 0, 'Noop list resolution runs → []')
  assert((await repo.listTeamAliases()).length === 0, 'Noop list team aliases → []')
  assert((await repo.updateProviderEntityMappingStatus('pem_x', { status: 'rejected' })).count === 0, 'Noop update mapping → count 0')
}

if (FAILURES.length > 0) { console.log(`[smoke] FAILED (${FAILURES.length}): ${FAILURES.join(' | ')}`); process.exitCode = 1 }
else console.log('[smoke] OK')
