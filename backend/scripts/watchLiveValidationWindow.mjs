/**
 * Live Validation Watcher (Phase E9.2) — OBSERVE-ONLY.
 * ─────────────────────────────────────────────────────────────────────────────
 * Polls the running backend (firebase mode) over a window to detect a REAL live
 * match with rich data, so the Pattern/Resolution workers can be validated with
 * genuine data. It NEVER creates alerts, never manipulates snapshots, never forces
 * status/score, never sends Telegram. It only reads status endpoints and reports.
 *
 * Usage (backend must be running with workers enabled):
 *   node scripts/watchLiveValidationWindow.mjs --duration 90 --interval 60
 *   node scripts/watchLiveValidationWindow.mjs --duration 5 --interval 30 --json
 *   node scripts/watchLiveValidationWindow.mjs --create-qa-pattern --cleanup-after
 *
 * Flags:
 *   --duration <minutes>   total observation time (default 10)
 *   --interval <seconds>   seconds between checks (default 60)
 *   --backend-url <url>    default http://localhost:4000
 *   --create-qa-pattern    create QA_E9_2_LIVE_VALIDATION (real, conservative) once
 *   --cleanup-after        remove the QA pattern at the end (via API archive)
 *   --json                 also write live-validation-watch-result.json
 *
 * The script does NOT decide validation passed — a human reads the report. It only
 * classifies the window honestly.
 */
import { writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
function flag(name) { return args.includes(`--${name}`) }
function val(name, def) { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] ? args[i + 1] : def }

const BASE = val('backend-url', 'http://localhost:4000')
const DURATION_MIN = parseInt(val('duration', '10'))
const INTERVAL_SEC = parseInt(val('interval', '60'))
const CREATE_QA = flag('create-qa-pattern')
const CLEANUP_AFTER = flag('cleanup-after')
const JSON_OUT = flag('json')

const LIVE_STATUSES = new Set(['1H', '2H', 'HT', 'ET', 'BT', 'P'])

async function get(path) {
  try {
    const res = await fetch(`${BASE}${path}`)
    return { ok: res.ok, status: res.status, json: await res.json().catch(() => ({})) }
  } catch (e) { return { ok: false, status: 0, error: e.message } }
}
async function post(path, body) {
  try {
    const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })
    return { ok: res.ok, status: res.status, json: await res.json().catch(() => ({})) }
  } catch (e) { return { ok: false, status: 0, error: e.message } }
}

function classify(liveCount, rich, partial) {
  if (liveCount === 0) return 'NO_LIVE_FIXTURES'
  if (rich > 0) return 'LIVE_RICH_DATA'
  if (partial > 0) return 'LIVE_PARTIAL_DATA'
  return 'LIVE_POOR_DATA'
}

async function snapshotState() {
  const health = await get('/api/health')
  const live = await get('/api/fixtures/live')
  const snaps = await get('/api/live-snapshots/recent?limit=50')
  const pw = await get('/api/pattern-worker/status')
  const rw = await get('/api/resolution-worker/status')
  const perf = await get('/api/performance/summary')

  const liveFixtures = Array.isArray(live.json?.data) ? live.json.data.filter(f => LIVE_STATUSES.has(f.status)) : []
  const snapshots = Array.isArray(snaps.json?.data) ? snaps.json.data : []
  // Only count snapshots that belong to currently-live fixtures (fresh, this window)
  const liveFixtureIds = new Set(liveFixtures.map(f => f.id))
  const liveSnaps = snapshots.filter(s => liveFixtureIds.has(s.fixtureId))
  const rich = liveSnaps.filter(s => s.dataQuality === 'rich').length
  const partial = liveSnaps.filter(s => s.dataQuality === 'partial').length
  const poor = liveSnaps.filter(s => s.dataQuality === 'poor').length

  return {
    checkedAt: new Date().toISOString(),
    provider: health.json?.persistenceProvider ?? 'unknown',
    liveFixturesCount: liveFixtures.length,
    snapshotsCount: liveSnaps.length,
    richSnapshotsCount: rich,
    partialSnapshotsCount: partial,
    poorSnapshotsCount: poor,
    workerErrors: [pw.json?.data?.lastError, rw.json?.data?.lastError].filter(Boolean),
    patternFixturesChecked: pw.json?.data?.totalFixturesChecked ?? null,
    alertsCreated: pw.json?.data?.totalAlertsCreated ?? null,
    pendingAlerts: perf.json?.data?.pendingCount ?? null,
    resolvedAlerts: rw.json?.data?.totalResolved ?? null,
    validationStatus: classify(liveFixtures.length, rich, partial),
  }
}

async function main() {
  console.log(`\n=== Live Validation Watcher (OBSERVE-ONLY) ===`)
  console.log(`Backend: ${BASE} · duration ${DURATION_MIN}min · interval ${INTERVAL_SEC}s\n`)

  const h0 = await get('/api/health')
  if (!h0.ok) { console.log(`❌ Backend not reachable at ${BASE}. Start it with workers enabled.`); process.exit(1) }
  console.log(`provider=${h0.json?.persistenceProvider} firebaseProjectId=${h0.json?.firebaseProjectId ?? 'n/a'}`)

  let qaPatternId = null
  if (CREATE_QA) {
    const body = { name: 'QA_E9_2_LIVE_VALIDATION', status: 'active', action: 'register_alert', minConfidence: 50, conditionsJson: '[{"type":"is_live","params":{}},{"type":"minute_between","params":{"min":1,"max":90}}]' }
    const r = await post('/api/patterns', body)
    qaPatternId = r.json?.data?.id || null
    console.log(`QA pattern created: ${qaPatternId} (${r.status})`)
  }

  const endAt = Date.now() + DURATION_MIN * 60 * 1000
  const RANK = { NO_LIVE_FIXTURES: 0, LIVE_POOR_DATA: 1, LIVE_PARTIAL_DATA: 2, LIVE_RICH_DATA: 3 }
  const TAIL_MAX = 60 // bound memory on long runs — keep only the most recent samples

  let best = 'NO_LIVE_FIXTURES'
  let sampleCount = 0
  let richEver = false
  let anyLiveEver = false
  let firstAlerts = null
  let firstResolved = null
  let lastSample = null
  const tail = []

  do {
    const s = await snapshotState()
    sampleCount++
    if (firstAlerts === null) { firstAlerts = s.alertsCreated ?? 0; firstResolved = s.resolvedAlerts ?? 0 }
    if (RANK[s.validationStatus] > RANK[best]) best = s.validationStatus
    if (s.richSnapshotsCount > 0) richEver = true
    if (s.liveFixturesCount > 0) anyLiveEver = true
    lastSample = s
    tail.push(s)
    if (tail.length > TAIL_MAX) tail.shift() // bounded
    console.log(`[${s.checkedAt}] ${s.validationStatus} live=${s.liveFixturesCount} snaps=${s.snapshotsCount} (rich=${s.richSnapshotsCount} partial=${s.partialSnapshotsCount} poor=${s.poorSnapshotsCount}) alertsCreated=${s.alertsCreated} resolved=${s.resolvedAlerts}${s.workerErrors.length ? ' ERRORS:' + s.workerErrors.join('|') : ''}`)
    if (Date.now() >= endAt) break
    await new Promise(r => setTimeout(r, INTERVAL_SEC * 1000))
  } while (Date.now() < endAt)

  if (CREATE_QA && CLEANUP_AFTER && qaPatternId) {
    const d = await fetch(`${BASE}/api/patterns/${qaPatternId}`, { method: 'DELETE' }).then(r => r.status).catch(() => 'err')
    console.log(`QA pattern archived (DELETE ${d}). Run firebaseCleanupQaData.mjs --confirm for full cleanup.`)
  }

  const result = {
    backend: BASE,
    durationMinutes: DURATION_MIN,
    intervalSeconds: INTERVAL_SEC,
    samples: sampleCount,
    bestObserved: best,
    richEverObserved: richEver,
    anyLiveEverObserved: anyLiveEver,
    alertsCreatedDuringWindow: lastSample ? ((lastSample.alertsCreated ?? 0) - (firstAlerts ?? 0)) : 0,
    resolvedDuringWindow: lastSample ? ((lastSample.resolvedAlerts ?? 0) - (firstResolved ?? 0)) : 0,
    recentSamples: tail,
    lastSample: lastSample,
    conclusion: best === 'LIVE_RICH_DATA'
      ? 'Rich live data observed — workers can be validated with real data (review samples).'
      : best === 'NO_LIVE_FIXTURES'
        ? 'No live match during the window — rich worker validation remains PENDING (no fake alert created).'
        : `Live but ${best} — insufficient for full rich gate validation; PENDING.`,
  }

  console.log(`\n=== Result ===`)
  console.log(JSON.stringify(result, null, 2))

  if (JSON_OUT) {
    writeFileSync('live-validation-watch-result.json', JSON.stringify(result, null, 2))
    console.log('\nWrote live-validation-watch-result.json')
  }
}

main().catch(err => { console.error('Watcher failed:', err.message); process.exit(1) })
