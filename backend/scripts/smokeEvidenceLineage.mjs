/**
 * Smoke test — Evidence Lineage (Phase B33). PURE for the core logic.
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests the env-free lineage helpers (deterministic ids/idempotency, honest
 * strength normalization, protection contribution) and asserts the Noop
 * intelligence adapter is safe for the new B33 methods. Never imports an
 * env-loading service for the pure parts.
 *
 * Build first: npm run build
 * Usage: node scripts/smokeEvidenceLineage.mjs
 */
const FAILURES = []
function assert(c, m) { if (!c) { FAILURES.push(m); console.log(`  [FAIL] ${m}`) } else console.log(`  [ok] ${m}`) }
async function load(p) { try { return await import(p) } catch (e) { console.error(`Could not import ${p}. Run \`npm run build\` first.`); console.error(e?.message || e); process.exit(1) } }

const u = await load('../dist/modules/intelligence/evidence/evidenceLineage.util.js')

console.log('[smoke] deterministic ids + idempotency:')
{
  const a = { snapshotId: 's1', fixtureId: 'f1', minute: 50, linkStrength: 'exact', source: 'backtest_result', sourceId: 'r1', evidenceKind: 'backtest_evaluation', reason: 'x' }
  const b = { ...a }
  assert(u.evidenceLinkId(a) === u.evidenceLinkId(b), 'same input → same id (idempotent)')
  const c = { ...a, snapshotId: 's2' }
  assert(u.evidenceLinkId(a) !== u.evidenceLinkId(c), 'different snapshot → different id')
  const noSnap1 = { fixtureId: 'f1', minute: 50, linkStrength: 'window_inferred', source: 'signal_ledger', sourceId: 'led1', evidenceKind: 'trigger_state', reason: 'x' }
  const noSnap2 = { ...noSnap1 }
  assert(u.evidenceLinkId(noSnap1) === u.evidenceLinkId(noSnap2), 'fixture/window link id is deterministic')
}

console.log('[smoke] strength honesty:')
{
  // exact requested without a snapshotId must NOT stay exact.
  const downgraded = u.normalizeLinkStrength({ fixtureId: 'f1', linkStrength: 'exact', source: 'signal_ledger', evidenceKind: 'trigger_state', reason: 'x' })
  assert(downgraded === 'strong_inferred', 'exact without snapshotId → strong_inferred (never fakes exact)')
  const keptExact = u.normalizeLinkStrength({ snapshotId: 's1', fixtureId: 'f1', linkStrength: 'exact', source: 'backtest_result', evidenceKind: 'backtest_evaluation', reason: 'x' })
  assert(keptExact === 'exact', 'exact WITH snapshotId stays exact')
  assert(u.strongerLink('exact', 'window_inferred') === 'exact', 'exact beats inferred')
  assert(u.strongerLink('weak_inferred', 'window_inferred') === 'window_inferred', 'window beats weak')
  assert(u.strongerLink('unknown', 'unknown') === 'unknown', 'unknown stays unknown')
}

console.log('[smoke] protection contribution:')
{
  assert(u.isExactLink({ linkStrength: 'exact', snapshotId: 's1' }) === true, 'exact + snapshotId → exact link')
  assert(u.isExactLink({ linkStrength: 'exact', snapshotId: null }) === false, 'exact claim without id is NOT exact')
  assert(u.linkProtects({ linkStrength: 'window_inferred' }) === true, 'inferred link protects')
  assert(u.linkProtects({ linkStrength: 'unknown' }) === false, 'unknown link does NOT authorize delete')
  assert(u.sourceToProtectionReason('backtest_result') === 'linked_to_backtest', 'backtest → linked_to_backtest')
  assert(u.sourceToProtectionReason('replay_step') === 'linked_to_replay', 'replay → linked_to_replay')
  assert(u.sourceToProtectionReason('signal_ledger') === 'linked_to_alert', 'ledger → linked_to_alert')
  assert(u.sourceToProtectionReason('promoted_alert') === 'linked_to_promoted_alert', 'promoted → linked_to_promoted_alert')
}

console.log('[smoke] buildReference defaults:')
{
  const ref = u.buildReference({ snapshotId: 's1', fixtureId: 'f1', linkStrength: 'exact', source: 'replay_step', sourceId: 'rr1', evidenceKind: 'replay_step', reason: 'r' }, '2026-01-01T00:00:00Z')
  assert(ref.id.startsWith('esr_'), 'reference id prefixed esr_')
  assert(ref.linkStrength === 'exact' && ref.snapshotId === 's1', 'reference keeps exact with id')
  assert(ref.alertId === null && ref.opportunityId === null, 'unset link fields default to null')
  assert(Array.isArray(ref.limitations), 'limitations defaults to array')
}

console.log('[smoke] Noop intelligence adapter B33 safety (prisma fallback):')
{
  const { NoopIntelligenceRepository } = await load('../dist/repositories/noopIntelligence.repository.js')
  const repo = new NoopIntelligenceRepository()
  const ref = { id: 'esr_x', snapshotId: 's1', fixtureId: 'f1', provider: null, capturedAt: null, minute: null, linkStrength: 'exact', source: 'backtest_result', sourceId: 'r1', sourceType: null, alertId: null, patternId: null, opportunityId: null, backtestRunId: null, replayRunId: null, learningEventId: null, outcomeId: null, policyEvaluationId: null, reason: 'x', evidenceKind: 'backtest_evaluation', createdAt: 'now', createdBy: null, limitations: [] }
  assert((await repo.createEvidenceSnapshotReference(ref)).id === 'esr_x', 'Noop create returns input')
  assert((await repo.createEvidenceSnapshotReferencesBatch([ref])).created === 0, 'Noop batch → created 0 (not persisted)')
  assert((await repo.getEvidenceSnapshotReference()) === null, 'Noop get → null')
  assert((await repo.listEvidenceSnapshotReferencesBySnapshot()).length === 0, 'Noop bySnapshot → []')
  assert((await repo.listEvidenceSnapshotReferencesByFixture()).length === 0, 'Noop byFixture → []')
  assert((await repo.listEvidenceSnapshotReferencesByAlert()).length === 0, 'Noop byAlert → []')
  assert((await repo.listEvidenceSnapshotReferencesByOpportunity()).length === 0, 'Noop byOpportunity → []')
}

if (FAILURES.length > 0) { console.log(`[smoke] FAILED (${FAILURES.length}): ${FAILURES.join(' | ')}`); process.exitCode = 1 }
else console.log('[smoke] OK')
