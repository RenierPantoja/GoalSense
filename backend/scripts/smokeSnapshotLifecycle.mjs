/**
 * Smoke test — Snapshot Lifecycle (Phase B32). PURE, no env/network.
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests the env-free lifecycle logic: protection derivation (protect-first),
 * lifecycle eligibility transitions, and retention-mode gating. Also asserts the
 * Noop intelligence adapter is safe for the new B32 methods (no throws, honest
 * empties). Never imports an env-loading service for the pure parts.
 *
 * Build first: npm run build
 * Usage: node scripts/smokeSnapshotLifecycle.mjs
 */
const FAILURES = []
function assert(c, m) { if (!c) { FAILURES.push(m); console.log(`  [FAIL] ${m}`) } else console.log(`  [ok] ${m}`) }
async function load(p) { try { return await import(p) } catch (e) { console.error(`Could not import ${p}. Run \`npm run build\` first.`); console.error(e?.message || e); process.exit(1) } }

const u = await load('../dist/modules/localops/utils/localOps.util.js')

console.log('[smoke] protection derivation (protect-first):')
{
  const recent = u.deriveProtectionReasons({ ageDays: 1, rawRetentionDays: 7, dependencyResolvable: true })
  assert(recent.protectedRecord && recent.reasons.includes('recent_snapshot'), 'recent snapshot → protected')
  const unknownDep = u.deriveProtectionReasons({ ageDays: 999, rawRetentionDays: 7, dependencyResolvable: false })
  assert(unknownDep.protectedRecord && unknownDep.reasons.includes('unknown_dependency'), 'unknown dependency → protected')
  const linked = u.deriveProtectionReasons({ ageDays: 999, rawRetentionDays: 7, linkedToAlert: true, dependencyResolvable: true })
  assert(linked.protectedRecord && linked.reasons.includes('linked_to_alert'), 'linked to alert → protected')
  const evidence = u.deriveProtectionReasons({ ageDays: 999, rawRetentionDays: 7, hasImportantEvent: true, dependencyResolvable: true })
  assert(evidence.reasons.includes('important_event') && evidence.reasons.includes('evidence_snapshot'), 'important event → evidence protected')
  const rawOld = u.deriveProtectionReasons({ ageDays: 30, rawRetentionDays: 7, dependencyResolvable: true })
  assert(!rawOld.protectedRecord && rawOld.reasons.length === 0, 'old, unlinked, resolvable → NOT protected (candidate)')
}

console.log('[smoke] lifecycle eligibility transitions:')
{
  const protectedRec = u.evaluateLifecycleEligibility({ currentState: 'active', protectedRecord: true, ageDays: 999, rawRetentionDays: 7 })
  assert(!protectedRec.eligibleForSoftDelete && !protectedRec.eligibleForHardDelete && protectedRec.blocked, 'protected → blocked, never deletable')
  const activeOld = u.evaluateLifecycleEligibility({ currentState: 'active', protectedRecord: false, ageDays: 30, rawRetentionDays: 7 })
  assert(activeOld.eligibleForSoftDelete && !activeOld.eligibleForHardDelete, 'active+old → soft-deletable, NOT hard-deletable directly')
  const marked = u.evaluateLifecycleEligibility({ currentState: 'marked_for_deletion', protectedRecord: false, ageDays: 30, rawRetentionDays: 7 })
  assert(marked.eligibleForHardDelete, 'marked → hard-deletable')
  const soft = u.evaluateLifecycleEligibility({ currentState: 'soft_deleted', protectedRecord: false, ageDays: 30, rawRetentionDays: 7 })
  assert(soft.eligibleForHardDelete && !soft.eligibleForSoftDelete, 'soft_deleted → hard-deletable, not soft again')
  const hard = u.evaluateLifecycleEligibility({ currentState: 'hard_deleted', protectedRecord: false, ageDays: 30, rawRetentionDays: 7 })
  assert(!hard.eligibleForSoftDelete && !hard.eligibleForHardDelete && hard.blocked, 'hard_deleted → nothing')
}

console.log('[smoke] retention mode gating (downgrade toward dry_run):')
{
  const off = u.resolveRetentionMode('hard_delete', { retentionEnabled: false, markEnabled: true, softEnabled: true, hardEnabled: true })
  assert(off.effectiveMode === 'dry_run' && off.downgraded && off.reason === 'retention_disabled', 'retention disabled → dry_run')
  const markNoFlag = u.resolveRetentionMode('mark_only', { retentionEnabled: true, markEnabled: false, softEnabled: false, hardEnabled: false })
  assert(markNoFlag.effectiveMode === 'dry_run' && markNoFlag.reason === 'mark_disabled', 'mark_only without flag → dry_run')
  const softNoFlag = u.resolveRetentionMode('soft_delete', { retentionEnabled: true, markEnabled: true, softEnabled: false, hardEnabled: false })
  assert(softNoFlag.effectiveMode === 'dry_run' && softNoFlag.reason === 'soft_delete_disabled', 'soft_delete without flag → dry_run')
  const hardNoFlag = u.resolveRetentionMode('hard_delete', { retentionEnabled: true, markEnabled: true, softEnabled: true, hardEnabled: false })
  assert(hardNoFlag.effectiveMode === 'dry_run' && hardNoFlag.reason === 'hard_delete_disabled', 'hard_delete without flag → dry_run')
  const hardOk = u.resolveRetentionMode('hard_delete', { retentionEnabled: true, markEnabled: true, softEnabled: true, hardEnabled: true })
  assert(hardOk.effectiveMode === 'hard_delete' && !hardOk.downgraded, 'all flags on → hard_delete honored')
  const dry = u.resolveRetentionMode('dry_run', { retentionEnabled: true, markEnabled: true, softEnabled: true, hardEnabled: true })
  assert(dry.effectiveMode === 'dry_run' && !dry.downgraded, 'dry_run stays dry_run')
}

console.log('[smoke] lifecycle state normalization:')
{
  assert(u.normalizeLifecycleState(undefined) === 'active', 'missing state → active')
  assert(u.normalizeLifecycleState('soft_deleted') === 'soft_deleted', 'valid state preserved')
  assert(u.normalizeLifecycleState('bogus') === 'active', 'invalid state → active')
}

console.log('[smoke] Noop intelligence adapter B32 safety (prisma fallback):')
{
  const { NoopIntelligenceRepository } = await load('../dist/repositories/noopIntelligence.repository.js')
  const repo = new NoopIntelligenceRepository()
  const run = { id: 'srr_x', mode: 'dry_run', requestedBy: null, startedAt: 'now', completedAt: null, scanned: 0, protectedRecords: 0, candidates: 0, marked: 0, softDeleted: 0, hardDeleted: 0, blocked: 0, errors: [], limitations: [] }
  assert((await repo.createSnapshotRetentionRun(run)).id === 'srr_x', 'Noop createSnapshotRetentionRun returns input')
  assert((await repo.updateSnapshotRetentionRun()).count === 0, 'Noop updateSnapshotRetentionRun → count 0')
  assert((await repo.getSnapshotRetentionRun()) === null, 'Noop getSnapshotRetentionRun → null')
  assert(Array.isArray(await repo.listSnapshotRetentionRuns()) && (await repo.listSnapshotRetentionRuns()).length === 0, 'Noop listSnapshotRetentionRuns → []')
  const metric = { id: 'lom_x', capturedAt: 'now', profile: 'safe_local', guardMode: 'observe', providerCallsAllowed: 0, providerCallsBlocked: 0, snapshotsWritten: 0, snapshotsSkippedDuplicate: 0, snapshotsSkippedInterval: 0, snapshotsSkippedMax: 0, fixturesSkippedByCap: 0, readBudgetUsed: 0, writeBudgetUsed: 0, riskLevel: 'low', warnings: 0 }
  assert((await repo.createLocalOpsMetricsSnapshot(metric)).id === 'lom_x', 'Noop createLocalOpsMetricsSnapshot returns input')
  assert((await repo.listLocalOpsMetricsSnapshots()).length === 0, 'Noop listLocalOpsMetricsSnapshots → []')
}

if (FAILURES.length > 0) { console.log(`[smoke] FAILED (${FAILURES.length}): ${FAILURES.join(' | ')}`); process.exitCode = 1 }
else console.log('[smoke] OK')
