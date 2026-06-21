/**
 * Smoke — Live Recheck Bridge Wiring (B50). PURE only.
 * ─────────────────────────────────────────────────────────────────────────────
 * Verifies offline: bridge OFF by default; OFF bridge never enqueues / never processes;
 * pure trigger detection from snapshot deltas; off bridge onLiveSnapshotCaptured returns
 * no enqueued triggers; bridge never alerts/blocks (it only detects + enqueues rechecks).
 *
 * Build first: npm run build
 * Usage: node scripts/smokeLiveRecheckBridgeWiring.mjs
 */
const FAILURES = []
function assert(c, m) { if (!c) { FAILURES.push(m); console.log(`  [FAIL] ${m}`) } else console.log(`  [ok] ${m}`) }
async function load(p) { try { return await import(p) } catch (e) { console.error(`Could not import ${p}. Run \`npm run build\` first.`); console.error(e?.message || e); process.exit(1) } }

const bridge = await load('../dist/modules/footballIntelligence/validation/localLiveReevaluationBridge.service.js')

console.log('[smoke] bridge OFF by default:')
{
  assert(bridge.isBridgeEnabled() === false, 'live recheck bridge OFF by default')
  const status = bridge.explainLiveRecheckBridgeStatus()
  assert(status.enabled === false, 'status reports disabled')
  assert(typeof status.minIntervalSeconds === 'number', 'status carries min interval')
}

console.log('[smoke] OFF bridge never enqueues / processes:')
{
  assert(bridge.enqueueGovernanceRecheck('f1', 'goal') === false, 'OFF bridge does not enqueue')
  assert((await bridge.processRecheckQueue()) === 0, 'OFF bridge processes nothing')
  const r = await bridge.onLiveSnapshotCaptured({ fixtureId: 'f1', status: '2H', scoreHome: 1, scoreAway: 0 }, { status: '2H', scoreHome: 0, scoreAway: 0 })
  assert(r.enqueued.length === 0, 'OFF bridge onLiveSnapshotCaptured enqueues nothing (never alerts/blocks)')
}

console.log('[smoke] pure trigger detection (delta-based):')
{
  const goal = bridge.detectRelevantLiveTriggers({ fixtureId: 'f1', status: '2H', scoreHome: 2, scoreAway: 1 }, { status: '2H', scoreHome: 1, scoreAway: 1 })
  assert(goal.includes('goal'), 'score increase → goal')
  const ft = bridge.detectRelevantLiveTriggers({ fixtureId: 'f1', status: 'FT', scoreHome: 2, scoreAway: 1 }, { status: '2H', scoreHome: 2, scoreAway: 1 })
  assert(ft.includes('post_match_completed') && ft.includes('match_status_changed'), '2H→FT → post_match_completed + match_status_changed')
  const red = bridge.detectRelevantLiveTriggers({ fixtureId: 'f1', status: '2H', scoreHome: 0, scoreAway: 0, eventsJson: JSON.stringify([{ type: 'red_card', minute: 40 }]) }, { status: '2H', scoreHome: 0, scoreAway: 0, eventsJson: JSON.stringify([]) })
  assert(red.includes('red_card'), 'new red card → red_card trigger')
  const none = bridge.detectRelevantLiveTriggers({ fixtureId: 'f1', status: '2H', scoreHome: 0, scoreAway: 0 }, { status: '2H', scoreHome: 0, scoreAway: 0 })
  assert(none.length === 0, 'no change → no trigger (no spurious alerts)')
  const noPrev = bridge.detectRelevantLiveTriggers(null, null)
  assert(Array.isArray(noPrev) && noPrev.length === 0, 'null snapshot → no trigger (non-fatal)')
}

if (FAILURES.length > 0) { console.log(`[smoke] FAILED (${FAILURES.length}): ${FAILURES.join(' | ')}`); process.exitCode = 1 }
else console.log('[smoke] OK')
