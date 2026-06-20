/**
 * Smoke test — Backtest/Replay Evidence Reprocessing (Phase B36). PURE core.
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests the env-free identity/fingerprint/compare/patch logic:
 *   - trigger/outcome identity (exact only with a real snapshotId);
 *   - fingerprint determinism;
 *   - compare: match allows patch, mismatch blocks, tolerance respected;
 *   - patch never carries resultStatus/outcome mutation;
 *   - exact recovery only with a real snapshotId.
 * Plus Noop adapter safety for the new B36 repo methods.
 *
 * Build first: npm run build
 * Usage: node scripts/smokeBacktestReplayEvidenceReprocessing.mjs
 */
const FAILURES = []
function assert(c, m) { if (!c) { FAILURES.push(m); console.log(`  [FAIL] ${m}`) } else console.log(`  [ok] ${m}`) }
async function load(p) { try { return await import(p) } catch (e) { console.error(`Could not import ${p}. Run \`npm run build\` first.`); console.error(e?.message || e); process.exit(1) } }

const u = await load('../dist/modules/intelligence/backtest/utils/backtestEvidenceIdentity.util.js')

console.log('[smoke] trigger/outcome identity (exact only with real id):')
{
  const ti = u.buildTriggerIdentity({ patternId: 'p1', patternName: 'P', signalType: 'goal_pressure', conditions: [{ type: 'is_live' }], triggerMinute: 70, fixtureId: 'f1', competitionId: 'L', teamContext: 'A vs B', snapshotId: 's1', snapshotCapturedAt: 't' })
  assert(ti.evaluatedAtSnapshotId === 's1' && ti.limitations.length === 0, 'trigger identity with real id → no limitation')
  const tiNo = u.buildTriggerIdentity({ patternId: 'p1', patternName: 'P', signalType: null, conditions: [], triggerMinute: 70, fixtureId: 'f1', competitionId: null, teamContext: null, snapshotId: null, snapshotCapturedAt: null })
  assert(tiNo.limitations.includes('trigger_snapshot_id_missing'), 'trigger identity without id → limitation')
  const oi = u.buildOutcomeIdentity({ outcomeType: 'goal_pressure', windowStartMinute: 70, windowEndMinute: 82, snapshotId: 's2', snapshotCapturedAt: 't', goals: 1, corners: 0, cards: 0 })
  assert(oi.outcomeSnapshotId === 's2' && oi.limitations.length === 0, 'outcome identity with real id')
}

console.log('[smoke] result fingerprint determinism:')
{
  const base = { fixtureId: 'f1', patternId: 'p1', triggerMinute: 70, triggerSnapshotId: 's1', outcomeStatus: 'confirmed', outcomeSnapshotId: 's2', wouldTrigger: true, notEvaluableReason: null }
  const a = u.buildResultFingerprint(base)
  const b = u.buildResultFingerprint({ ...base })
  assert(a.hash === b.hash, 'same inputs → same hash')
  const c = u.buildResultFingerprint({ ...base, outcomeStatus: 'failed' })
  assert(a.hash !== c.hash, 'different outcome → different hash')
  assert(a.resultStatus === 'triggered', 'wouldTrigger true → triggered')
}

console.log('[smoke] compare gates patch:')
{
  const original = { fixtureId: 'f1', patternId: 'p1', wouldTrigger: true, estimatedOutcome: 'confirmed', minute: 70 }
  const derivedMatch = { fixtureId: 'f1', patternId: 'p1', wouldTrigger: true, estimatedOutcome: 'confirmed', minute: 70, triggerSnapshotId: 's1' }
  const m = u.compareBacktestResult(original, derivedMatch, 0)
  assert(m.match && m.canRecoverExact, 'identical + real id → match + recoverable')

  const derivedMismatch = { fixtureId: 'f1', patternId: 'p1', wouldTrigger: true, estimatedOutcome: 'failed', minute: 70, triggerSnapshotId: 's1' }
  const mm = u.compareBacktestResult(original, derivedMismatch, 0)
  assert(!mm.match && mm.mismatches.includes('estimatedOutcome'), 'different outcome → mismatch blocks patch')

  const offByOne = { fixtureId: 'f1', patternId: 'p1', wouldTrigger: true, estimatedOutcome: 'confirmed', minute: 71, triggerSnapshotId: 's1' }
  assert(!u.compareBacktestResult(original, offByOne, 0).match, 'minute off by 1, tolerance 0 → mismatch')
  assert(u.compareBacktestResult(original, offByOne, 1).match, 'minute off by 1, tolerance 1 → match')

  const noId = { fixtureId: 'f1', patternId: 'p1', wouldTrigger: true, estimatedOutcome: 'confirmed', minute: 70, triggerSnapshotId: null }
  const ni = u.compareBacktestResult(original, noId, 0)
  assert(ni.match && !ni.canRecoverExact, 'match but no real id → not recoverable (no exact)')
}

console.log('[smoke] patch never mutates outcome/result:')
{
  const derived = { triggerSnapshotId: 's1', triggerEvidenceStrength: 'exact', outcomeSnapshotId: 's2', outcomeEvidenceStrength: 'exact', estimatedOutcome: 'confirmed', wouldTrigger: true }
  const patch = u.buildEvidencePatch(derived, 'brr_x')
  assert(patch.triggerSnapshotId === 's1' && patch.evidenceReprocessStatus === 'patched', 'patch carries snapshot id + status')
  assert(!('estimatedOutcome' in patch) && !('wouldTrigger' in patch), 'patch does NOT carry outcome/result fields')
  assert(patch.evidenceReprocessRunId === 'brr_x', 'patch carries reprocess run id')
}

console.log('[smoke] replay step identity:')
{
  const step = { minute: 60, status: '2H', score: { home: 1, away: 0 }, passedConditions: ['a'], missingConditions: [], blockers: [], snapshotId: 's9' }
  const id = u.buildReplayStepIdentity(step, 3, 'f1')
  assert(id.stepIndex === 3 && id.snapshotId === 's9' && id.limitations.length === 0, 'step identity with id')
  const id2 = u.buildReplayStepIdentity({ ...step, snapshotId: null }, 3, 'f1')
  assert(id2.limitations.includes('step_snapshot_id_missing'), 'step without id → limitation')
}

console.log('[smoke] Noop adapter B36 safety (prisma fallback):')
{
  const { NoopIntelligenceRepository } = await load('../dist/repositories/noopIntelligence.repository.js')
  const repo = new NoopIntelligenceRepository()
  assert((await repo.updateBacktestSignalResult()).count === 0, 'Noop updateBacktestSignalResult → 0')
  const run = { id: 'brr_x', targetType: 'backtest', targetRunId: 'r', mode: 'dry_run', requestedBy: null, startedAt: 'now', completedAt: null, scannedResults: 0, matchedResults: 0, patchedResults: 0, mismatchedResults: 0, skippedResults: 0, errors: [], exactRecovered: 0, inferredRecovered: 0, limitations: [], status: 'completed' }
  assert((await repo.createBacktestReplayEvidenceReprocessRun(run)).id === 'brr_x', 'Noop create reprocess run returns input')
  assert((await repo.getBacktestReplayEvidenceReprocessRun()) === null, 'Noop get → null')
  assert((await repo.listBacktestReplayEvidenceReprocessRuns()).length === 0, 'Noop list → []')
}

if (FAILURES.length > 0) { console.log(`[smoke] FAILED (${FAILURES.length}): ${FAILURES.join(' | ')}`); process.exitCode = 1 }
else console.log('[smoke] OK')
