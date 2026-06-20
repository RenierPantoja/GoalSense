/**
 * Smoke test — Live Pipeline Guard Integration (Phase B31). PURE, no env/network.
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests the env-free guard logic that powers the live-pipeline integration:
 * guard-mode resolution + recommendation, snapshot write decisions (dedup /
 * interval / max-per-match), provider budget evaluation, and snapshot retention
 * classification (protect-when-linked, raw-old → candidate). Never imports an
 * env-loading service.
 *
 * Build first: npm run build
 * Usage: node scripts/smokeLivePipelineGuards.mjs
 */
const FAILURES = []
function assert(c, m) { if (!c) { FAILURES.push(m); console.log(`  [FAIL] ${m}`) } else console.log(`  [ok] ${m}`) }
async function load(p) { try { return await import(p) } catch (e) { console.error(`Could not import ${p}. Run \`npm run build\` first.`); console.error(e?.message || e); process.exit(1) } }

const u = await load('../dist/modules/localops/utils/localOps.util.js')

console.log('[smoke] guard mode resolution + recommendation:')
{
  assert(u.resolveGuardMode('safe_local', 'observe') === 'observe', 'observe env → observe')
  assert(u.resolveGuardMode('safe_local', 'enforce') === 'enforce', 'enforce env wins regardless of profile')
  assert(u.recommendedGuardMode('live_validation') === 'enforce', 'live_validation recommends enforce')
  assert(u.recommendedGuardMode('safe_local') === 'observe', 'safe_local recommends observe')
  assert(u.recommendedGuardMode('intensive_debug') === 'observe', 'intensive_debug recommends observe')
}

console.log('[smoke] provider budget evaluation (observe does not block, enforce blocks):')
{
  // observe semantics are at the service layer; the pure rule is the limit eval.
  assert(u.evaluateUsageLimit({ minuteCount: 0, hourCount: 0, maxPerMinute: 20, maxPerHour: 400 }).allowed, 'fresh budget → allowed')
  const blockedMin = u.evaluateUsageLimit({ minuteCount: 20, hourCount: 10, maxPerMinute: 20, maxPerHour: 400 })
  assert(!blockedMin.allowed && blockedMin.reason === 'minute_limit', 'minute limit → blocked (enforce would block)')
  const blockedHour = u.evaluateUsageLimit({ minuteCount: 0, hourCount: 400, maxPerMinute: 20, maxPerHour: 400 })
  assert(!blockedHour.allowed && blockedHour.reason === 'hour_limit', 'hour limit → blocked')
}

console.log('[smoke] snapshot write decisions:')
{
  const base = { minute: 60, status: '2H', scoreHome: 1, scoreAway: 1, eventsCount: 4, statsFingerprint: 'x' }
  const dup = u.decideSnapshotWrite({ current: { ...base }, last: { state: base, atMs: 0 }, nowMs: 10_000, minIntervalSeconds: 45, countThisMatch: 1, maxPerMatch: 60 })
  assert(!dup.shouldWrite && dup.skippedReason === 'no_relevant_change', 'duplicate → skipped (not a failure)')
  const goal = u.decideSnapshotWrite({ current: { ...base, scoreHome: 2 }, last: { state: base, atMs: 0 }, nowMs: 5_000, minIntervalSeconds: 45, countThisMatch: 1, maxPerMatch: 60 })
  assert(goal.shouldWrite, 'score/status relevant change → write even within interval')
  const status = u.decideSnapshotWrite({ current: { ...base, status: 'FT' }, last: { state: base, atMs: 0 }, nowMs: 1_000, minIntervalSeconds: 45, countThisMatch: 1, maxPerMatch: 60 })
  assert(status.shouldWrite, 'status change → write')
  const interval = u.decideSnapshotWrite({ current: { ...base, statsFingerprint: 'y' }, last: { state: base, atMs: 0 }, nowMs: 10_000, minIntervalSeconds: 45, countThisMatch: 1, maxPerMatch: 60 })
  assert(!interval.shouldWrite && interval.skippedReason === 'min_interval_not_elapsed', 'stats-only within interval → skipped')
  const capped = u.decideSnapshotWrite({ current: { ...base, scoreHome: 9 }, last: { state: base, atMs: 0 }, nowMs: 99_000, minIntervalSeconds: 45, countThisMatch: 60, maxPerMatch: 60 })
  assert(!capped.shouldWrite && capped.skippedReason === 'max_per_match_reached', 'max-per-fixture cap → skipped')
}

console.log('[smoke] snapshot retention classification:')
{
  const rawNew = u.classifySnapshotRetention({ ageDays: 1, linkage: {}, retentionDaysRaw: 7, retentionDaysImportant: 30 })
  assert(rawNew.category === 'raw' && !rawNew.protectedRecord && !rawNew.wouldDelete, 'raw within window → keep, not candidate')
  const rawOld = u.classifySnapshotRetention({ ageDays: 30, linkage: {}, retentionDaysRaw: 7, retentionDaysImportant: 30 })
  assert(rawOld.category === 'raw' && rawOld.wouldDelete, 'raw beyond window → delete candidate')
  const alert = u.classifySnapshotRetention({ ageDays: 999, linkage: { linkedToAlert: true }, retentionDaysRaw: 7, retentionDaysImportant: 30 })
  assert(alert.category === 'important_for_alert' && alert.protectedRecord && !alert.wouldDelete, 'linked to alert → protected even if old')
  const promoted = u.classifySnapshotRetention({ ageDays: 999, linkage: { linkedToPromotedAlert: true, linkedToAlert: true }, retentionDaysRaw: 7, retentionDaysImportant: 30 })
  assert(promoted.category === 'promoted_alert_related' && promoted.protectedRecord, 'promoted-alert linkage takes precedence + protected')
  const replay = u.classifySnapshotRetention({ ageDays: 999, linkage: { linkedToReplay: true }, retentionDaysRaw: 7, retentionDaysImportant: 30 })
  assert(replay.category === 'important_for_replay' && replay.protectedRecord && !replay.wouldDelete, 'linked to replay → protected (backtest/replay honesty preserved)')
  const backtest = u.classifySnapshotRetention({ ageDays: 999, linkage: { linkedToBacktest: true }, retentionDaysRaw: 7, retentionDaysImportant: 30 })
  assert(backtest.category === 'important_for_backtest' && backtest.protectedRecord, 'linked to backtest → protected')
}

if (FAILURES.length > 0) { console.log(`[smoke] FAILED (${FAILURES.length}): ${FAILURES.join(' | ')}`); process.exitCode = 1 }
else console.log('[smoke] OK')
