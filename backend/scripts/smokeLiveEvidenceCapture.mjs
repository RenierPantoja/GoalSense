/**
 * Smoke test — Live Alert Evidence Capture (Phase B34). PURE core logic.
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests the env-free evidence-context strength resolution and the lineage util
 * (exact only with a real snapshotId; inferred never fakes exact). Also asserts
 * the Noop intelligence adapter is safe for the evidence methods. No env/network.
 *
 * Build first: npm run build
 * Usage: node scripts/smokeLiveEvidenceCapture.mjs
 */
const FAILURES = []
function assert(c, m) { if (!c) { FAILURES.push(m); console.log(`  [FAIL] ${m}`) } else console.log(`  [ok] ${m}`) }
async function load(p) { try { return await import(p) } catch (e) { console.error(`Could not import ${p}. Run \`npm run build\` first.`); console.error(e?.message || e); process.exit(1) } }

const ec = await load('../dist/modules/intelligence/evidence/evidenceContext.types.js')
const u = await load('../dist/modules/intelligence/evidence/evidenceLineage.util.js')

console.log('[smoke] strengthForSnapshotId (exact only with real id):')
{
  assert(ec.strengthForSnapshotId('s1') === 'exact', 'real snapshotId → exact')
  assert(ec.strengthForSnapshotId(null) === 'window_inferred', 'null id → window_inferred (default)')
  assert(ec.strengthForSnapshotId(undefined, 'weak_inferred') === 'weak_inferred', 'undefined id → provided fallback')
  assert(ec.strengthForSnapshotId('') === 'window_inferred', 'empty id → inferred (not exact)')
}

console.log('[smoke] trigger/outcome/opportunity link strength honesty:')
{
  // buildReference enforces exact only with a real snapshotId (B33 invariant).
  const exact = u.buildReference({ snapshotId: 's1', fixtureId: 'f1', linkStrength: 'exact', source: 'signal_ledger', sourceId: 'a1', evidenceKind: 'trigger_state', reason: 'x' }, 'now')
  assert(exact.linkStrength === 'exact' && exact.snapshotId === 's1', 'trigger with real id → exact')
  const noId = u.buildReference({ fixtureId: 'f1', linkStrength: 'exact', source: 'signal_ledger', sourceId: 'a1', evidenceKind: 'trigger_state', reason: 'x' }, 'now')
  assert(noId.linkStrength === 'strong_inferred', 'trigger exact WITHOUT id → downgraded (never fakes exact)')
  const outcome = u.buildReference({ snapshotId: 's2', fixtureId: 'f1', linkStrength: 'exact', source: 'alert_outcome', sourceId: 'o1', evidenceKind: 'outcome_state', reason: 'x' }, 'now')
  assert(u.isExactLink(outcome) === true, 'outcome with real id → exact link')
  const opp = u.buildReference({ snapshotId: null, fixtureId: 'f1', linkStrength: 'window_inferred', source: 'auto_opportunity', sourceId: 'op1', evidenceKind: 'auto_opportunity_evidence', reason: 'x' }, 'now')
  assert(opp.linkStrength === 'window_inferred' && opp.limitations.length === 0, 'opportunity without id → inferred (honest)')
}

console.log('[smoke] idempotency of trigger/outcome links:')
{
  const a = u.evidenceLinkId({ snapshotId: 's1', fixtureId: 'f1', source: 'signal_ledger', sourceId: 'a1', evidenceKind: 'trigger_state', reason: 'x', linkStrength: 'exact' })
  const b = u.evidenceLinkId({ snapshotId: 's1', fixtureId: 'f1', source: 'signal_ledger', sourceId: 'a1', evidenceKind: 'trigger_state', reason: 'y', linkStrength: 'exact' })
  assert(a === b, 'same target/source/kind → same id regardless of reason')
  const trig = u.evidenceLinkId({ snapshotId: 's1', fixtureId: 'f1', source: 'signal_ledger', sourceId: 'a1', evidenceKind: 'trigger_state', reason: 'x', linkStrength: 'exact' })
  const out = u.evidenceLinkId({ snapshotId: 's1', fixtureId: 'f1', source: 'alert_outcome', sourceId: 'a1', evidenceKind: 'outcome_state', reason: 'x', linkStrength: 'exact' })
  assert(trig !== out, 'trigger and outcome links are distinct')
}

console.log('[smoke] Noop intelligence adapter evidence safety (prisma fallback):')
{
  const { NoopIntelligenceRepository } = await load('../dist/repositories/noopIntelligence.repository.js')
  const repo = new NoopIntelligenceRepository()
  assert((await repo.createEvidenceSnapshotReferencesBatch([])).created === 0, 'Noop batch empty → 0')
  assert((await repo.listEvidenceSnapshotReferencesByAlert()).length === 0, 'Noop byAlert → []')
  assert((await repo.listEvidenceSnapshotReferencesByOpportunity()).length === 0, 'Noop byOpportunity → []')
}

if (FAILURES.length > 0) { console.log(`[smoke] FAILED (${FAILURES.length}): ${FAILURES.join(' | ')}`); process.exitCode = 1 }
else console.log('[smoke] OK')
