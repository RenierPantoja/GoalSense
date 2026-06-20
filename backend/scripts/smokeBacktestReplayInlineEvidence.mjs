/**
 * Smoke test — Backtest/Replay Inline Snapshot Evidence (Phase B35). PURE.
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests the env-free summary/coverage aggregation over inline snapshot evidence:
 *   - exact trigger/outcome counted only with a real snapshotId;
 *   - evidence coverage NEVER changes hit/fail/unknown counts;
 *   - old results (no inline fields) stay valid (counted as missing evidence);
 *   - inferred is not exact.
 * Imports only the pure summary builder (no env/network).
 *
 * Build first: npm run build
 * Usage: node scripts/smokeBacktestReplayInlineEvidence.mjs
 */
const FAILURES = []
function assert(c, m) { if (!c) { FAILURES.push(m); console.log(`  [FAIL] ${m}`) } else console.log(`  [ok] ${m}`) }
async function load(p) { try { return await import(p) } catch (e) { console.error(`Could not import ${p}. Run \`npm run build\` first.`); console.error(e?.message || e); process.exit(1) } }

const { buildBacktestSummary } = await load('../dist/modules/intelligence/backtest/backtestSummary.service.js')

const coverage = { fixturesFound: 3, fixturesWithSnapshots: 3, fixturesWithoutSnapshots: 0, snapshotsEvaluated: 30, richDataCount: 10, partialDataCount: 10, poorDataCount: 10, unknownDataCount: 0, notEvaluableCount: 0, providerBreakdown: { espn: 30 } }

function result(over) {
  return {
    fixtureId: 'f', fixtureLabel: 'A vs B', leagueName: 'L', homeTeam: 'A', awayTeam: 'B',
    minute: 70, scoreState: { home: 1, away: 0 }, wouldTrigger: true, confidenceAtTrigger: 60,
    matchedConditions: [], missingConditions: [], blockedReasons: [], dataQuality: 'partial',
    matchContext: null, estimatedOutcome: 'confirmed', outcomeReason: 'ok', evidence: null, ...over,
  }
}

console.log('[smoke] evidence coverage counts exact only with real id:')
{
  const exact = result({ triggerSnapshotId: 's1', triggerEvidenceStrength: 'exact', outcomeSnapshotId: 's2', outcomeEvidenceStrength: 'exact' })
  const inferred = result({ triggerSnapshotId: null, triggerEvidenceStrength: 'window_inferred', outcomeSnapshotId: null, outcomeEvidenceStrength: 'window_inferred', triggerEvidenceLimitations: ['trigger_snapshot_id_missing'] })
  const oldNoFields = result({}) // legacy run: no inline fields at all
  const s = buildBacktestSummary([exact, inferred, oldNoFields], coverage)
  const ec = s.evidenceCoverage
  assert(!!ec, 'evidenceCoverage present')
  assert(ec.totalResults === 3, 'totalResults = 3')
  assert(ec.resultsWithExactTriggerSnapshot === 1, 'exactly 1 exact trigger (real id only)')
  assert(ec.resultsWithExactOutcomeSnapshot === 1, 'exactly 1 exact outcome')
  assert(ec.resultsWithAnyEvidence === 2, 'exact + inferred count as any evidence; legacy does not')
  assert(ec.missingEvidenceRate !== null && ec.missingEvidenceRate > 0, 'legacy run → counted as missing evidence (not failure)')
  assert(ec.commonLimitations.some(l => l.limitation === 'trigger_snapshot_id_missing'), 'limitation surfaced')
}

console.log('[smoke] evidence coverage NEVER changes outcome counts:')
{
  const a = result({ estimatedOutcome: 'confirmed', triggerSnapshotId: 's1' })
  const b = result({ estimatedOutcome: 'failed', triggerSnapshotId: null })
  const c = result({ estimatedOutcome: 'unknown' })
  const s = buildBacktestSummary([a, b, c], coverage)
  assert(s.confirmed === 1 && s.failed === 1 && s.unknown === 1, 'hit/fail/unknown unchanged by evidence fields')
  assert(s.signalsTriggered === 3, 'triggered count unchanged')
  // unknown/missing evidence is NOT a failed outcome
  assert(s.failed === 1, 'missing evidence did not inflate failed')
}

console.log('[smoke] old run with no results → coverage zeros, still valid:')
{
  const s = buildBacktestSummary([], coverage)
  assert(s.evidenceCoverage.totalResults === 0, 'empty results → totalResults 0')
  assert(s.evidenceCoverage.exactEvidenceRate === null, 'empty → null rate (honest, not 0/0)')
}

console.log('[smoke] inferred is not exact:')
{
  const inferredOnly = result({ triggerSnapshotId: null, triggerEvidenceStrength: 'strong_inferred', outcomeSnapshotId: null, outcomeEvidenceStrength: 'window_inferred' })
  const s = buildBacktestSummary([inferredOnly], coverage)
  assert(s.evidenceCoverage.resultsWithExactTriggerSnapshot === 0, 'strong_inferred is not exact')
  assert(s.evidenceCoverage.resultsWithAnyEvidence === 1, 'inferred still counts as some evidence')
}

if (FAILURES.length > 0) { console.log(`[smoke] FAILED (${FAILURES.length}): ${FAILURES.join(' | ')}`); process.exitCode = 1 }
else console.log('[smoke] OK')
