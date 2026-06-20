/**
 * Smoke test — Live Session Attribution (Phase B38). PURE core + Noop safety.
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests the env-free attribution decision + outcome QA + evidence link session
 * field. Honest: unknown/not_evaluable/pending never count as failures; attribution
 * only when running + auto-attach + (broad scope or fixture attached).
 *
 * Build first: npm run build
 * Usage: node scripts/smokeLiveSessionAttribution.mjs
 */
const FAILURES = []
function assert(c, m) { if (!c) { FAILURES.push(m); console.log(`  [FAIL] ${m}`) } else console.log(`  [ok] ${m}`) }
async function load(p) { try { return await import(p) } catch (e) { console.error(`Could not import ${p}. Run \`npm run build\` first.`); console.error(e?.message || e); process.exit(1) } }

const u = await load('../dist/modules/validation/utils/liveValidationReport.util.js')
const ev = await load('../dist/modules/intelligence/evidence/evidenceLineage.util.js')

console.log('[smoke] attribution decision:')
{
  const broad = { status: 'running', autoAttach: true, broadScope: true, attachedFixtureIds: [] }
  assert(u.shouldAttributeFixture(broad, 'f1') === true, 'running + broad scope → attribute any fixture')
  const scoped = { status: 'running', autoAttach: true, broadScope: false, attachedFixtureIds: ['f1', 'f2'] }
  assert(u.shouldAttributeFixture(scoped, 'f1') === true, 'fixture in attached set → attribute')
  assert(u.shouldAttributeFixture(scoped, 'f9') === false, 'fixture NOT attached → no attribution')
  const paused = { status: 'paused', autoAttach: true, broadScope: true, attachedFixtureIds: [] }
  assert(u.shouldAttributeFixture(paused, 'f1') === false, 'paused session → no attribution')
  const noAuto = { status: 'running', autoAttach: false, broadScope: true, attachedFixtureIds: [] }
  assert(u.shouldAttributeFixture(noAuto, 'f1') === false, 'auto-attach off → no attribution')
}

console.log('[smoke] outcome QA: unknown/not_evaluable/pending are never failures:')
{
  const b = { confirmed: 2, confirmed_partial: 1, failed: 1, unknown: 3, not_evaluable: 2, pending: 4 }
  const fr = u.outcomeFailureRate(b)
  // decisive = confirmed + partial + failed = 4 → failed/decisive = 1/4
  assert(fr === 0.25, 'failure rate = failed / decisive only (unknown/not_evaluable/pending excluded)')
  const none = u.outcomeFailureRate({ confirmed: 0, confirmed_partial: 0, failed: 0, unknown: 5, not_evaluable: 3, pending: 2 })
  assert(none === null, 'no decisive outcomes → null rate (not 0/0, not failure)')
}

console.log('[smoke] evidence reference carries session id (optional):')
{
  const withSession = ev.buildReference({ snapshotId: 's1', fixtureId: 'f1', linkStrength: 'exact', source: 'signal_ledger', sourceId: 'a1', evidenceKind: 'trigger_state', reason: 'x', validationSessionId: 'lvs_1' }, 'now')
  assert(withSession.validationSessionId === 'lvs_1', 'reference carries validationSessionId when provided')
  const without = ev.buildReference({ snapshotId: 's1', fixtureId: 'f1', linkStrength: 'exact', source: 'signal_ledger', sourceId: 'a1', evidenceKind: 'trigger_state', reason: 'x' }, 'now')
  assert(without.validationSessionId === null, 'reference defaults validationSessionId to null (legacy-safe)')
}

console.log('[smoke] Noop adapter B37/B38 session safety (prisma fallback):')
{
  const { NoopIntelligenceRepository } = await load('../dist/repositories/noopIntelligence.repository.js')
  const repo = new NoopIntelligenceRepository()
  assert((await repo.listLiveValidationSessions()).length === 0, 'Noop sessions → []')
  assert((await repo.listLiveValidationSessionFixtures()).length === 0, 'Noop fixtures → []')
  assert((await repo.createLiveValidationSessionEvent({ id: 'e1' })).id === 'e1', 'Noop createEvent returns input (non-fatal)')
}

if (FAILURES.length > 0) { console.log(`[smoke] FAILED (${FAILURES.length}): ${FAILURES.join(' | ')}`); process.exitCode = 1 }
else console.log('[smoke] OK')
