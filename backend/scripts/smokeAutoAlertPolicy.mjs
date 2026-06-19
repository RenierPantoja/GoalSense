/**
 * Smoke test — Auto Alert Policy Engine + Shadow Mode (Phase B25). PURE, no env/network.
 * ─────────────────────────────────────────────────────────────────────────────
 * Imports ONLY env-free modules (pure policy guard + template + Noop repo). Never
 * imports the evaluation/config services (which load env).
 *
 * Asserts:
 *   - policy disabled / mode disabled → skipped_policy_disabled (never creates)
 *   - shadow_only with passing gates → shadow_would_create (canAutoCreate false)
 *   - suggest_manual with passing gates → suggest_manual_review (never creates)
 *   - auto_create_monitored WITHOUT flags → shadow_would_create (never creates)
 *   - auto_create_monitored WITH all flags → auto_created intent + canAutoCreate true
 *   - missing calibration (requireCalibration) → blocked
 *   - poor data → blocked
 *   - critical risk-gate blocker → blocked
 *   - dismissed / already promoted / duplicate → blocked/skipped
 *   - score below min → blocked
 *   - unknown is never treated as failed in gates
 *   - default template is shadow_only + disabled (never auto-active)
 *   - Noop B25 methods return empty / accept writes without throwing
 *
 * Build first: npm run build
 * Usage: node scripts/smokeAutoAlertPolicy.mjs
 */
const FAILURES = []
function assert(cond, msg) {
  if (!cond) { FAILURES.push(msg); console.log(`  [FAIL] ${msg}`) }
  else console.log(`  [ok] ${msg}`)
}
async function load(path) {
  try { return await import(path) }
  catch (e) { console.error(`Could not import ${path}. Run \`npm run build\` first.`); console.error(e?.message || e); process.exit(1) }
}

const guard = await load('../dist/modules/intelligence/autoEngine/utils/autoAlertPolicyGuard.util.js')
const tmpl = await load('../dist/modules/intelligence/autoEngine/utils/autoAlertPolicyTemplate.util.js')
const noop = await load('../dist/repositories/noopIntelligence.repository.js')

const basePolicy = (over) => ({
  id: 'p1', name: 'P', enabled: true, mode: 'shadow_only', opportunityTypes: [], minScore: 60,
  minSampleQuality: 'moderate', allowedConfidenceBands: ['high', 'medium'], allowedDataQuality: ['rich', 'partial'],
  allowedLeagues: [], blockedLeagues: [], allowedTeams: [], blockedTeams: [], minuteWindows: [],
  maxPerFixture: 1, maxPerRun: 3, requireCalibration: true, requireNoCriticalBlockers: true,
  requireLearningProfile: false, allowUnknownData: false, allowPoorData: false,
  createdAt: '', updatedAt: '', createdByUserId: null, ...over,
})
const goodCalib = { hasTypeProfile: true, sampleQuality: 'moderate', usefulRate: 0.6, unknownRate: 0.2, failedRate: 0.2, scoreBucketInsufficient: false }
const baseInput = (over) => ({
  policy: basePolicy(), score: { score: 75, confidenceBand: 'high', status: 'strong', opportunityType: 'late_goal_pressure' },
  league: 'Serie A', homeTeam: 'A', awayTeam: 'B', minuteWindow: '81_90', dataQuality: 'partial',
  riskGate: { allowed: true, blockReasons: [], warnings: [] }, calibration: goodCalib,
  dismissed: false, alreadyPromoted: false, isDuplicate: false, perFixtureCount: 0, perRunCount: 0,
  flags: { policyEnabled: true, createEnabled: false, toAlertsEnabled: false }, ...over,
})

console.log('[smoke] disabled / mode disabled:')
{
  const r1 = guard.evaluatePolicyGates(baseInput({ flags: { policyEnabled: false, createEnabled: false, toAlertsEnabled: false } }))
  assert(r1.decision === 'skipped_policy_disabled' && !r1.canAutoCreate, 'policy flag off → skipped_policy_disabled, never creates')
  const r2 = guard.evaluatePolicyGates(baseInput({ policy: basePolicy({ mode: 'disabled' }) }))
  assert(r2.decision === 'skipped_policy_disabled', 'mode disabled → skipped_policy_disabled')
  const r3 = guard.evaluatePolicyGates(baseInput({ policy: basePolicy({ enabled: false }) }))
  assert(r3.decision === 'skipped_policy_disabled', 'enabled=false → skipped_policy_disabled')
}

console.log('[smoke] shadow / suggest / auto modes:')
{
  const shadow = guard.evaluatePolicyGates(baseInput())
  assert(shadow.decision === 'shadow_would_create' && !shadow.canAutoCreate, 'shadow_only + passing gates → shadow_would_create (no create)')

  const suggest = guard.evaluatePolicyGates(baseInput({ policy: basePolicy({ mode: 'suggest_manual' }) }))
  assert(suggest.decision === 'suggest_manual_review' && !suggest.canAutoCreate, 'suggest_manual → suggest_manual_review (no create)')

  const autoNoFlags = guard.evaluatePolicyGates(baseInput({ policy: basePolicy({ mode: 'auto_create_monitored' }) }))
  assert(autoNoFlags.decision === 'shadow_would_create' && !autoNoFlags.canAutoCreate, 'auto_create without flags → shadow_would_create (no create)')

  const autoFlags = guard.evaluatePolicyGates(baseInput({ policy: basePolicy({ mode: 'auto_create_monitored' }), flags: { policyEnabled: true, createEnabled: true, toAlertsEnabled: true } }))
  assert(autoFlags.decision === 'auto_created' && autoFlags.canAutoCreate, 'auto_create + all flags → auto_created intent + canAutoCreate')
}

console.log('[smoke] critical gates block:')
{
  const noCalib = guard.evaluatePolicyGates(baseInput({ calibration: { hasTypeProfile: false, sampleQuality: null, usefulRate: null, unknownRate: null, failedRate: null, scoreBucketInsufficient: false } }))
  assert(noCalib.decision === 'blocked', 'missing calibration (required) → blocked')

  const poor = guard.evaluatePolicyGates(baseInput({ dataQuality: 'poor' }))
  assert(poor.decision === 'blocked', 'poor data → blocked')

  const unknownDq = guard.evaluatePolicyGates(baseInput({ dataQuality: 'unknown' }))
  assert(unknownDq.decision === 'blocked', 'unknown data → blocked (never failed)')

  const critBlocker = guard.evaluatePolicyGates(baseInput({ riskGate: { allowed: false, blockReasons: ['missing_required_data'], warnings: [] } }))
  assert(critBlocker.decision === 'blocked', 'critical risk-gate blocker → blocked')

  const lowScore = guard.evaluatePolicyGates(baseInput({ score: { score: 40, confidenceBand: 'high', status: 'strong', opportunityType: 'late_goal_pressure' } }))
  assert(lowScore.decision === 'blocked', 'score below min → blocked')

  const dismissed = guard.evaluatePolicyGates(baseInput({ dismissed: true }))
  assert(dismissed.decision === 'blocked', 'dismissed opportunity → blocked')

  const dup = guard.evaluatePolicyGates(baseInput({ isDuplicate: true }))
  assert(dup.decision === 'skipped_duplicate', 'duplicate → skipped_duplicate (never creates)')

  const promoted = guard.evaluatePolicyGates(baseInput({ alreadyPromoted: true }))
  assert(promoted.decision === 'skipped_duplicate', 'already promoted → skipped_duplicate')

  const perFixture = guard.evaluatePolicyGates(baseInput({ perFixtureCount: 1 }))
  assert(perFixture.decision === 'blocked', 'max per fixture reached → blocked')

  const insufficientSample = guard.evaluatePolicyGates(baseInput({ calibration: { ...goodCalib, sampleQuality: 'insufficient', scoreBucketInsufficient: true } }))
  assert(insufficientSample.decision === 'blocked', 'insufficient calibration sample → blocked (below min)')

  // candidate status (not strong/watch) blocked
  const cand = guard.evaluatePolicyGates(baseInput({ score: { score: 75, confidenceBand: 'high', status: 'candidate', opportunityType: 'late_goal_pressure' } }))
  assert(cand.decision === 'blocked', 'candidate status → blocked (only strong/watch)')
}

console.log('[smoke] high unknown is a warning, not a block:')
{
  const highUnknown = guard.evaluatePolicyGates(baseInput({ calibration: { ...goodCalib, unknownRate: 0.7 } }))
  assert(highUnknown.decision === 'shadow_would_create', 'unknownRate 0.7 (>0.6) → still shadow (warning only, unknown ≠ failed, never blocks)')
  const gate = highUnknown.gates.find(g => g.name === 'calibration_unknown_rate')
  assert(gate && gate.severity === 'warning' && !gate.passed, 'high unknown-rate gate is a warning (not passed), never critical')
}

console.log('[smoke] default template safety:')
{
  const t = tmpl.buildDefaultPolicyTemplate({ minScore: 70, minSampleQuality: 'moderate', maxPerFixture: 1, maxPerRun: 3, requireCalibration: true, requireNoCriticalBlockers: true }, '2026-01-01T00:00:00.000Z')
  assert(t.enabled === false && t.mode === 'shadow_only', 'default template is disabled + shadow_only (never auto-active)')
  assert(t.allowPoorData === false && t.allowUnknownData === false, 'default template blocks poor/unknown data')

  // normalize forces auto_create payload to stay safe is enforced in service, but template defaults are conservative
  const norm = tmpl.normalizePolicyInput({ mode: 'auto_create_monitored', allowPoorData: true }, t, 'p2', '2026-01-01T00:00:00.000Z')
  assert(norm.mode === 'auto_create_monitored', 'normalize keeps requested mode (service downgrades if flag off)')
  assert(norm.minScore === 70, 'normalize keeps safe defaults')
}

console.log('[smoke] Noop B25 safety (prisma fallback):')
{
  const repo = new noop.NoopIntelligenceRepository()
  assert(Array.isArray(await repo.listAutoAlertPolicies()), 'Noop listAutoAlertPolicies → []')
  assert((await repo.getAutoAlertPolicy('x')) === null, 'Noop getAutoAlertPolicy → null')
  assert((await repo.updateAutoAlertPolicy('x', {})).count === 0, 'Noop updateAutoAlertPolicy → count 0')
  assert(Array.isArray(await repo.listAutoAlertPolicyEvaluations()), 'Noop listAutoAlertPolicyEvaluations → []')
  assert(Array.isArray(await repo.listAutoAlertPolicyEvaluationsByOpportunity('o')), 'Noop byOpportunity → []')
  const pol = basePolicy()
  assert((await repo.createAutoAlertPolicy(pol)) === pol, 'Noop createAutoAlertPolicy accepts write without throwing')
}

if (FAILURES.length > 0) { console.log(`[smoke] FAILED (${FAILURES.length}): ${FAILURES.join(' | ')}`); process.exitCode = 1 }
else console.log('[smoke] OK')
