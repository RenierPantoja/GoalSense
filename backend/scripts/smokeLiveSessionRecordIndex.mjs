/**
 * Smoke test — Live Session Record Index (Phase B39). PURE core + Noop safety.
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests env-free index helpers: deterministic/idempotent buildRecordLinkId,
 * exact-vs-inferred classification, and dynamic-attach scope matching. Honest:
 * `inferred` never becomes `exact`; absent session = inferred (never failure).
 *
 * Build first: npm run build
 * Usage: node scripts/smokeLiveSessionRecordIndex.mjs
 */
const FAILURES = []
function assert(c, m) { if (!c) { FAILURES.push(m); console.log(`  [FAIL] ${m}`) } else console.log(`  [ok] ${m}`) }
async function load(p) { try { return await import(p) } catch (e) { console.error(`Could not import ${p}. Run \`npm run build\` first.`); console.error(e?.message || e); process.exit(1) } }

const u = await load('../dist/modules/validation/utils/liveValidationIndex.util.js')

console.log('[smoke] buildRecordLinkId — deterministic + idempotent:')
{
  const a = u.buildRecordLinkId({ validationSessionId: 's1', recordType: 'alert', recordId: 'r1' })
  const b = u.buildRecordLinkId({ validationSessionId: 's1', recordType: 'alert', recordId: 'r1' })
  assert(a === b, 'same input → same id (idempotent)')
  assert(a.startsWith('lvl_'), 'id is namespaced lvl_<hash>')
  const c = u.buildRecordLinkId({ validationSessionId: 's1', recordType: 'alert', recordId: 'r2' })
  assert(a !== c, 'different recordId → different id')
  const d = u.buildRecordLinkId({ validationSessionId: 's2', recordType: 'alert', recordId: 'r1' })
  assert(a !== d, 'different session → different id')
  const e = u.buildRecordLinkId({ validationSessionId: 's1', recordType: 'outcome', recordId: 'r1' })
  assert(a !== e, 'different recordType → different id')
}

console.log('[smoke] classifyAttribution — exact vs inferred, never lies:')
{
  assert(u.classifyAttribution('s1', 's1') === 'exact_session_id', 'matching session → exact')
  assert(u.classifyAttribution('s2', 's1') === 'inferred_fixture_window', 'mismatched session → inferred')
  assert(u.classifyAttribution(null, 's1') === 'inferred_fixture_window', 'missing session id → inferred (legacy-safe)')
  assert(u.classifyAttribution(undefined, 's1') === 'inferred_fixture_window', 'undefined session id → inferred')
}

console.log('[smoke] matchesSessionScope — pure dynamic-attach scope logic:')
{
  const broad = u.matchesSessionScope({ competition: 'Anything', homeTeam: 'A', awayTeam: 'B' })
  assert(broad.matched === true && broad.scopeType === 'broad', 'no filters → broad match')

  const byIdHit = u.matchesSessionScope({ fixtureIds: ['f1', 'f2'], fixtureId: 'f1' })
  assert(byIdHit.matched === true && byIdHit.scopeType === 'fixtureIds', 'fixtureId in explicit list → match')
  const byIdMiss = u.matchesSessionScope({ fixtureIds: ['f1', 'f2'], fixtureId: 'f9' })
  assert(byIdMiss.matched === false, 'fixtureId not in list → no match')

  const leagueHit = u.matchesSessionScope({ leagueNames: ['Premier League'], competition: 'Premier League', homeTeam: 'A', awayTeam: 'B' })
  assert(leagueHit.matched === true, 'league in scope → match')
  const leagueMiss = u.matchesSessionScope({ leagueNames: ['Serie A'], competition: 'Premier League', homeTeam: 'A', awayTeam: 'B' })
  assert(leagueMiss.matched === false && leagueMiss.scopeType === 'leagueNames', 'league out of scope → no match')

  const teamHit = u.matchesSessionScope({ teamNames: ['Arsenal'], competition: 'X', homeTeam: 'Arsenal', awayTeam: 'B' })
  assert(teamHit.matched === true, 'home team in scope → match')
  const teamMiss = u.matchesSessionScope({ teamNames: ['Chelsea'], competition: 'X', homeTeam: 'Arsenal', awayTeam: 'Spurs' })
  assert(teamMiss.matched === false && teamMiss.scopeType === 'teamNames', 'no team in scope → no match')

  // Accent/case-insensitive fuzzy match.
  const fuzzy = u.matchesSessionScope({ leagueNames: ['Brasileirao'], competition: 'Brasileirão Série A', homeTeam: 'A', awayTeam: 'B' })
  assert(fuzzy.matched === true, 'accent/case-insensitive league containment → match')
}

console.log('[smoke] Noop adapter B39 index safety (prisma fallback):')
{
  const { NoopIntelligenceRepository } = await load('../dist/repositories/noopIntelligence.repository.js')
  const repo = new NoopIntelligenceRepository()
  assert((await repo.listLiveValidationRecordLinksBySession('s1')).length === 0, 'Noop record links by session → []')
  assert((await repo.createLiveValidationRecordLink({ id: 'lvl_x' })).id === 'lvl_x', 'Noop createLink returns input (non-fatal)')
  assert((await repo.createLiveValidationRecordLinksBatch([{ id: 'a' }, { id: 'b' }])).created === 0, 'Noop batch is non-persisting (created=0, honest)')
  assert((await repo.getLiveValidationSessionMetricCounter('s1', 'total')) === null, 'Noop metric counter → null')
  assert((await repo.listDynamicFixtureAttachRuns('s1')).length === 0, 'Noop attach runs → []')
}

if (FAILURES.length > 0) { console.log(`[smoke] FAILED (${FAILURES.length}): ${FAILURES.join(' | ')}`); process.exitCode = 1 }
else console.log('[smoke] OK')
