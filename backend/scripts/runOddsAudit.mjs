/**
 * Runtime Odds Audit Script (Phase D2.2)
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs the odds coverage audit against the LOCAL running backend and prints
 * a readable coverage report. Helps decide the D3 direction with real data.
 *
 * Usage (with backend running on localhost:4000):
 *   node scripts/runOddsAudit.mjs
 *   node scripts/runOddsAudit.mjs --limit 15
 *   node scripts/runOddsAudit.mjs --base http://localhost:4000
 *
 * Requires: ODDS_ENABLED=true, ODDS_PROVIDER=api_football, valid key, DB with fixtures.
 */

const args = process.argv.slice(2)
function arg(name, def) {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : def
}

const BASE = arg('base', 'http://localhost:4000')
const LIMIT = arg('limit', '10')

async function get(path) {
  try {
    const res = await fetch(`${BASE}${path}`)
    const json = await res.json()
    return { ok: res.ok, status: res.status, json }
  } catch (err) {
    return { ok: false, status: 0, error: err.message }
  }
}

async function main() {
  console.log(`\n=== GoalSense Odds Audit ===\nBackend: ${BASE}\n`)

  // 1. Status
  const status = await get('/api/odds/status')
  console.log('--- /api/odds/status ---')
  if (!status.ok) {
    console.log(`❌ Failed (status ${status.status}). ${status.error || ''}`)
    console.log('Make sure the backend is running and ODDS_ENABLED=true.\n')
    return
  }
  console.log(JSON.stringify(status.json.data || status.json, null, 2))
  const s = status.json.data || status.json
  if (!s.configured) {
    console.log('\n⚠️  Odds not configured (need valid ODDS_API_KEY or API_FOOTBALL_KEY). Stopping.\n')
    return
  }

  // 2. Live batch audit
  console.log(`\n--- /api/odds/audit/live?limit=${LIMIT} ---`)
  const live = await get(`/api/odds/audit/live?limit=${LIMIT}`)
  if (!live.ok) {
    console.log(`❌ Failed (status ${live.status})`)
  } else {
    const data = live.json.data || live.json
    console.log('\nSummary:')
    console.log(JSON.stringify(data.summary, null, 2))
    console.log('\nPer-fixture coverage:')
    for (const r of data.reports || []) {
      console.log(`\n  ${r.matchLabel} [${r.competition}] (${r.status})`)
      console.log(`    odds=${r.totalOdds} bookmakers=${r.bookmakersFound.length} timing=${r.oddsTiming}`)
      console.log(`    MW:${r.hasMatchWinner ? '✓' : '✗'} O/U:${r.hasOverUnderGoals ? '✓' : '✗'} BTTS:${r.hasBothTeamsScore ? '✓' : '✗'} Corners:${r.hasCorners ? '✓' : '✗'} Cards:${r.hasCards ? '✓' : '✗'} AH:${r.hasAsianHandicap ? '✓' : '✗'}`)
      if (r.warnings.length > 0) console.log(`    ⚠️  ${r.warnings.join(', ')}`)
    }
    console.log(`\n📊 Recommendation for D3: ${data.summary.recommendationForD3}`)
  }

  // 3. Live odds endpoint feasibility
  console.log(`\n--- /api/odds/audit/live-feasibility ---`)
  const feas = await get('/api/odds/audit/live-feasibility')
  if (!feas.ok) {
    console.log(`❌ Failed (status ${feas.status})`)
  } else {
    const data = feas.json.data || feas.json
    console.log(JSON.stringify(data.probe, null, 2))
    if (data.probe.requiresUpgrade) console.log('\n⚠️  /odds/live requires a plan upgrade.')
    else if (data.probe.available) console.log('\n✅ /odds/live appears available — D3 Live Odds Integration is feasible.')
    else console.log('\n⚠️  /odds/live did not return data — verify plan/fixture.')
  }

  console.log('\n=== Audit complete ===\n')
}

main().catch(err => { console.error('Audit failed:', err); process.exit(1) })
