/**
 * Smoke — Multi-Provider Pre-Match Acquisition + Lineup Window (B40). PURE + Noop.
 * ─────────────────────────────────────────────────────────────────────────────
 * Verifies the honest acquisition layer WITHOUT touching network or Firebase:
 * registry configured/unconfigured, router never calls an unconfigured provider,
 * provider_not_supported vs provider_not_configured, acquisition windows, snapshot
 * store helpers, and observe-first precheck. Absent ≠ zero; unknown ≠ failed.
 *
 * Build first: npm run build
 * Usage: node scripts/smokePreMatchAcquisition.mjs
 */
const FAILURES = []
function assert(c, m) { if (!c) { FAILURES.push(m); console.log(`  [FAIL] ${m}`) } else console.log(`  [ok] ${m}`) }
async function load(p) { try { return await import(p) } catch (e) { console.error(`Could not import ${p}. Run \`npm run build\` first.`); console.error(e?.message || e); process.exit(1) } }

const reg = await load('../dist/modules/footballIntelligence/providers/providerRegistry.service.js')
const router = await load('../dist/modules/footballIntelligence/providers/footballDataProviderRouter.service.js')
const planner = await load('../dist/modules/footballIntelligence/preMatchAcquisitionPlanner.service.js')
const store = await load('../dist/modules/footballIntelligence/preMatchDataStore.service.js')
const pre = await load('../dist/modules/footballIntelligence/alertDecisionPrecheck.service.js')
const apiFootball = await load('../dist/modules/footballIntelligence/providers/adapters/apiFootballProvider.adapter.js')

console.log('[smoke] provider registry — configured vs unconfigured:')
{
  const configured = reg.listConfiguredProviders().map(p => p.providerName)
  assert(configured.includes('espn'), 'ESPN is configured (no key needed)')
  assert(!configured.includes('api_football'), 'api_football NOT configured/enabled by default')
  assert(!configured.includes('sportmonks'), 'sportmonks NOT configured/enabled by default')
  assert(reg.getBestProviderForDomain('today_fixtures')?.providerName === 'espn', 'best provider for today_fixtures = espn')
  assert(reg.getBestProviderForDomain('injuries') === null, 'no configured provider for injuries (not "no injury")')
  const stack = reg.buildProviderStackReport()
  assert(stack.domainCoverage.injuries.supported === true, 'injuries is SUPPORTED by some provider (declared)')
  assert(stack.domainCoverage.injuries.bestProvider === null, 'injuries has no configured provider → bestProvider null')
  assert(reg.explainProviderMissing('injuries') !== null, 'missing injuries explained honestly')
}

console.log('[smoke] provider router — never calls an unconfigured provider:')
{
  const inj = await router.fetchWithFallback('injuries', { fixtureId: 'f1' })
  assert(inj.availability === 'provider_not_configured', 'injuries → provider_not_configured (no env, not called)')
  assert(inj.canonicalData === null, 'injuries returns null data (NOT an empty "no injuries" list)')
  const susp = await router.fetchWithFallback('suspensions', { fixtureId: 'f1' })
  assert(susp.availability === 'provider_not_configured', 'suspensions → provider_not_configured')
  assert(susp.canonicalData === null, 'suspensions null data (NOT "no suspensions")')
}

console.log('[smoke] skeleton adapter — supported vs configured honesty:')
{
  const af = apiFootball.createApiFootballAdapter()
  const notConfigured = await af.fetchDomain('injuries', { fixtureId: 'f1' })
  assert(notConfigured.availability === 'provider_not_configured', 'api_football injuries (no key) → provider_not_configured')
  const notSupported = await af.fetchDomain('live_events', { fixtureId: 'f1' })
  assert(notSupported.availability === 'provider_not_supported', 'api_football live_events (not declared) → provider_not_supported')
}

console.log('[smoke] acquisition windows (T-24h..live..post):')
{
  assert(planner.currentWindow(1440, 'NS') === 'T-24h', '>6h → T-24h')
  assert(planner.currentWindow(300, 'NS') === 'T-6h', '<=6h → T-6h')
  assert(planner.currentWindow(85, 'NS') === 'T-90min', '<=90min → T-90min')
  assert(planner.currentWindow(45, 'NS') === 'T-60min', '<=60min → T-60min')
  assert(planner.currentWindow(10, 'NS') === 'T-15min', '<=15min → T-15min')
  assert(planner.currentWindow(20, '1H') === 'live', 'live status → live window')
  assert(planner.currentWindow(null, 'FT') === 'post', 'finished → post window')
}

console.log('[smoke] pre-match data store helpers:')
{
  const a = store.snapshotId('f1', 'injuries'); const b = store.snapshotId('f1', 'injuries')
  assert(a === b && a.startsWith('pms_'), 'snapshotId deterministic + namespaced')
  assert(store.snapshotId('f1', 'injuries') !== store.snapshotId('f1', 'suspensions'), 'different domain → different id')
  const snap = store.fromFetchResult('f1', { domain: 'injuries', provider: 'api_football', availability: 'available', freshness: 'fresh', dataQuality: 'partial', fetchedAt: new Date().toISOString(), canonicalData: { x: 1 }, payloadSummary: 's', reasons: [], limitations: [], providerCandidatesTried: [] })
  assert(!!snap.expiresAt, 'snapshot has expiresAt (TTL)')
  assert(store.isSnapshotFresh(snap) === true, 'fresh snapshot is fresh')
  assert(store.isSnapshotFresh({ ...snap, expiresAt: new Date(Date.now() - 1000).toISOString() }) === false, 'expired snapshot not fresh')
  assert(store.effectiveFreshness({ ...snap, expiresAt: new Date(Date.now() - 1000).toISOString() }) === 'stale', 'expired → stale freshness')
}

console.log('[smoke] precheck observe-first (V1+V2 share the mode):')
{
  assert(pre.precheckMode() === 'observe', 'precheck mode = observe by default')
  assert(pre.isPrecheckEnabled() === false, 'precheck disabled by default (never blocks real alerts)')
}

console.log('[smoke] Noop adapter B40 store safety (prisma fallback):')
{
  const { NoopIntelligenceRepository } = await load('../dist/repositories/noopIntelligence.repository.js')
  const repo = new NoopIntelligenceRepository()
  assert((await repo.savePreMatchDomainSnapshot({ id: 'pms_x', domain: 'injuries' })).id === 'pms_x', 'Noop save returns input (non-fatal)')
  assert((await repo.getPreMatchDomainSnapshot('f1', 'injuries')) === null, 'Noop get snapshot → null')
  assert((await repo.listPreMatchDomainSnapshots('f1')).length === 0, 'Noop list snapshots → []')
  assert((await repo.listPreMatchAcquisitionRuns({})).length === 0, 'Noop list runs → []')
}

if (FAILURES.length > 0) { console.log(`[smoke] FAILED (${FAILURES.length}): ${FAILURES.join(' | ')}`); process.exitCode = 1 }
else console.log('[smoke] OK')
