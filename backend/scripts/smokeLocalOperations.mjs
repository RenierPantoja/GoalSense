/**
 * Smoke test — Local Live Operations (Phase B30). PURE, no env/network.
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests the env-free guardrail logic (profiles, provider-limit eval, snapshot
 * decision, volume estimate). Never imports env-loading services.
 *
 * Asserts:
 *   - safe_local recommends dangerous flags OFF; mismatch detected when one is ON
 *   - provider guard blocks after per-minute / per-hour limit
 *   - snapshot guard skips duplicate (no relevant change)
 *   - snapshot guard writes on relevant change (score/status)
 *   - snapshot guard respects max-per-match cap
 *   - min interval blocks a stats-only change but a hard change always passes
 *   - unknown/missing data is never a failure (no failure semantics in decisions)
 *   - volume estimate risk escalates with volume; zero fixtures → low
 *
 * Build first: npm run build
 * Usage: node scripts/smokeLocalOperations.mjs
 */
const FAILURES = []
function assert(c, m) { if (!c) { FAILURES.push(m); console.log(`  [FAIL] ${m}`) } else console.log(`  [ok] ${m}`) }
async function load(p) { try { return await import(p) } catch (e) { console.error(`Could not import ${p}. Run \`npm run build\` first.`); console.error(e?.message || e); process.exit(1) } }

const u = await load('../dist/modules/localops/utils/localOps.util.js')

console.log('[smoke] runtime profile recommendations:')
{
  const rec = u.profileRecommendation('safe_local')
  assert(rec.recommendedFlags.ENABLE_AUTO_ALERT_CREATE === false && rec.recommendedFlags.TELEGRAM_ENABLED === false, 'safe_local recommends dangerous flags OFF')
  const mm = u.flagMismatches('safe_local', { ENABLE_AUTO_ALERT_CREATE: true, TELEGRAM_ENABLED: false })
  assert(mm.includes('ENABLE_AUTO_ALERT_CREATE') && !mm.includes('TELEGRAM_ENABLED'), 'mismatch detected for an ON dangerous flag')
  assert(u.profileRecommendation('intensive_debug').profile === 'intensive_debug', 'intensive_debug profile resolves')
  assert(u.flagMismatches('safe_local', {}).length === 0, 'no mismatches when nothing dangerous is on')
}

console.log('[smoke] provider usage limit eval:')
{
  assert(u.evaluateUsageLimit({ minuteCount: 5, hourCount: 50, maxPerMinute: 20, maxPerHour: 400 }).allowed, 'within limits → allowed')
  assert(u.evaluateUsageLimit({ minuteCount: 20, hourCount: 50, maxPerMinute: 20, maxPerHour: 400 }).reason === 'minute_limit', 'minute limit reached → blocked')
  assert(u.evaluateUsageLimit({ minuteCount: 1, hourCount: 400, maxPerMinute: 20, maxPerHour: 400 }).reason === 'hour_limit', 'hour limit reached → blocked')
}

console.log('[smoke] snapshot write decision:')
{
  const base = { minute: 50, status: '2H', scoreHome: 1, scoreAway: 0, eventsCount: 3, statsFingerprint: 'a' }
  // First snapshot (no last) → write
  const first = u.decideSnapshotWrite({ current: base, last: null, nowMs: 100000, minIntervalSeconds: 45, countThisMatch: 0, maxPerMatch: 60 })
  assert(first.shouldWrite && first.reason === 'relevant_change', 'first snapshot → write')

  // Identical state shortly after → skip (no relevant change)
  const dup = u.decideSnapshotWrite({ current: { ...base }, last: { state: base, atMs: 100000 }, nowMs: 110000, minIntervalSeconds: 45, countThisMatch: 1, maxPerMatch: 60 })
  assert(!dup.shouldWrite && dup.skippedReason === 'no_relevant_change', 'duplicate state → skipped (not a failure)')

  // Score change → always write even within min interval
  const goal = u.decideSnapshotWrite({ current: { ...base, scoreHome: 2 }, last: { state: base, atMs: 100000 }, nowMs: 105000, minIntervalSeconds: 45, countThisMatch: 1, maxPerMatch: 60 })
  assert(goal.shouldWrite, 'score change (hard) → write even within min interval')

  // Stats-only change within min interval → skip due to interval
  const statsSoon = u.decideSnapshotWrite({ current: { ...base, statsFingerprint: 'b' }, last: { state: base, atMs: 100000 }, nowMs: 110000, minIntervalSeconds: 45, countThisMatch: 1, maxPerMatch: 60 })
  assert(!statsSoon.shouldWrite && statsSoon.skippedReason === 'min_interval_not_elapsed', 'stats-only change within interval → skipped')

  // Stats-only change after interval → write
  const statsLater = u.decideSnapshotWrite({ current: { ...base, statsFingerprint: 'b' }, last: { state: base, atMs: 100000 }, nowMs: 100000 + 46000, minIntervalSeconds: 45, countThisMatch: 1, maxPerMatch: 60 })
  assert(statsLater.shouldWrite, 'relevant change after min interval → write')

  // Max per match reached → skip
  const capped = u.decideSnapshotWrite({ current: { ...base, scoreHome: 5 }, last: { state: base, atMs: 100000 }, nowMs: 200000, minIntervalSeconds: 45, countThisMatch: 60, maxPerMatch: 60 })
  assert(!capped.shouldWrite && capped.skippedReason === 'max_per_match_reached', 'max-per-match cap → skipped')

  assert(u.snapshotHash(base) === u.snapshotHash({ ...base }), 'snapshotHash deterministic for equal states')
  assert(u.snapshotHash(base) !== u.snapshotHash({ ...base, scoreHome: 2 }), 'snapshotHash differs on score change')
}

console.log('[smoke] volume estimate risk:')
{
  const zero = u.estimateVolume({ liveFixtures: 0, intervalSeconds: 30, snapshotsPerFixturePerMatch: 60, providerCallsPerRun: 1, writeBudgetPerHour: 2000, readBudgetPerHour: 5000 })
  assert(zero.riskLevel === 'low' && zero.projectedWritesPerHour === 0, 'no fixtures → low risk, zero writes')
  const heavy = u.estimateVolume({ liveFixtures: 40, intervalSeconds: 5, snapshotsPerFixturePerMatch: 100000, providerCallsPerRun: 11, writeBudgetPerHour: 100, readBudgetPerHour: 100 })
  assert(heavy.riskLevel === 'unsafe', 'huge volume vs tiny budget → unsafe')
  assert(heavy.projectedDailyWrites === heavy.projectedWritesPerHour * 24, 'daily writes = hourly * 24')
}

if (FAILURES.length > 0) { console.log(`[smoke] FAILED (${FAILURES.length}): ${FAILURES.join(' | ')}`); process.exitCode = 1 }
else console.log('[smoke] OK')
