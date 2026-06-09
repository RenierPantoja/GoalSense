/**
 * DB-Free API-Football Odds Audit (Phase D2.2F)
 * ─────────────────────────────────────────────────────────────────────────────
 * Standalone audit of API-Football odds coverage. NO database, NO Prisma,
 * NO backend server, NO DATABASE_URL required.
 *
 * Fetches fixtures directly from API-Football, then queries odds per fixture,
 * and reports market coverage to decide the D3 direction.
 *
 * Usage:
 *   node scripts/runApiFootballOddsAudit.mjs --source live --limit 15
 *   node scripts/runApiFootballOddsAudit.mjs --source today --limit 15
 *   node scripts/runApiFootballOddsAudit.mjs --source upcoming --limit 30
 *   node scripts/runApiFootballOddsAudit.mjs --source live --limit 10 --json
 *
 * RULES:
 * - Zero mock, zero invented data.
 * - Never logs the API key.
 * - Reads key from ODDS_API_KEY | API_FOOTBALL_KEY | API_FOOTBALL_KEYS (first).
 * - Read-only: never persists, never places bets, never sends to Telegram.
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// ─── CLI args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
function arg(name, def) {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def
}
const hasFlag = (name) => args.includes(`--${name}`)

const SOURCE = arg('source', 'live')        // live | today | upcoming
const LIMIT = parseInt(arg('limit', '15'))
const WRITE_JSON = hasFlag('json')

const BASE_URL = 'https://v3.football.api-sports.io'
const TIMEOUT_MS = 10000

// ─── Lightweight .env loader (no dotenv dependency) ──────────────────────────

function loadEnvFile(path) {
  if (!existsSync(path)) return {}
  const out = {}
  try {
    const content = readFileSync(path, 'utf8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      let val = trimmed.slice(eq + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      if (!(key in out)) out[key] = val
    }
  } catch { /* ignore */ }
  return out
}

// Merge env from process.env + multiple .env files (process.env wins)
const fileEnv = {
  ...loadEnvFile(resolve(ROOT, 'backend/.env')),
  ...loadEnvFile(resolve(ROOT, '.env')),
}
function envVar(name) {
  return process.env[name] || fileEnv[name]
}

// ─── Key resolution ──────────────────────────────────────────────────────────

function resolveApiKey() {
  const single = envVar('ODDS_API_KEY') || envVar('API_FOOTBALL_KEY')
  if (single && single.trim()) return single.trim()
  const plural = envVar('API_FOOTBALL_KEYS')
  if (plural && plural.trim()) {
    const first = plural.split(',')[0].trim()
    if (first) return first
  }
  return null
}

const API_KEY = resolveApiKey()

// ─── HTTP helper ─────────────────────────────────────────────────────────────

async function apiGet(path) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const start = Date.now()
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      signal: controller.signal,
      headers: { 'x-apisports-key': API_KEY, 'Accept': 'application/json' },
    })
    const latency = Date.now() - start
    const json = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, json, latency }
  } catch (err) {
    return { ok: false, status: 0, json: {}, latency: Date.now() - start, error: err?.name === 'AbortError' ? 'timeout' : err?.message }
  } finally {
    clearTimeout(timeout)
  }
}

// ─── Market mapping (duplicated minimal, no backend import) ──────────────────

const MARKET_NAME_MAP = {
  'match winner': 'match_winner',
  'home/away': 'match_winner',
  'goals over/under': 'over_under_goals',
  'over/under': 'over_under_goals',
  'over under': 'over_under_goals',
  'both teams score': 'both_teams_score',
  'both teams to score': 'both_teams_score',
  'asian handicap': 'asian_handicap',
  'corners over under': 'corners',
  'total corners': 'corners',
  'cards over under': 'cards',
  'total cards': 'cards',
  'next goal': 'next_goal',
}
function mapBetName(name) {
  return MARKET_NAME_MAP[(name || '').toLowerCase().trim()] || 'custom_unknown'
}

const ALERT_MARKETS = {
  goal_pressure: ['over_under_goals', 'next_goal', 'both_teams_score'],
  late_goal: ['over_under_goals', 'next_goal', 'both_teams_score'],
  over_trend: ['over_under_goals', 'next_goal', 'both_teams_score'],
  corner_pressure: ['corners'],
  card_heat: ['cards'],
  favorite_risk: ['match_winner', 'asian_handicap'],
  underdog_threat: ['match_winner', 'asian_handicap'],
}

// ─── Fixture fetch ───────────────────────────────────────────────────────────

function todayStr(offsetDays = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

async function fetchFixtures(source, limit) {
  let path
  if (source === 'live') path = '/fixtures?live=all'
  else if (source === 'today') path = `/fixtures?date=${todayStr(0)}`
  else if (source === 'upcoming') path = `/fixtures?date=${todayStr(1)}`
  else path = '/fixtures?live=all'

  const res = await apiGet(path)
  if (!res.ok) return { fixtures: [], error: `Fixtures fetch failed (HTTP ${res.status})`, raw: res }

  const apiErrors = res.json?.errors
  const hasErrors = apiErrors && (Array.isArray(apiErrors) ? apiErrors.length : Object.keys(apiErrors).length)
  if (hasErrors) return { fixtures: [], error: `API errors: ${JSON.stringify(apiErrors).slice(0, 200)}`, raw: res }

  const list = (res.json?.response || []).slice(0, limit).map(f => ({
    fixtureId: String(f.fixture?.id),
    matchLabel: `${f.teams?.home?.name || '?'} vs ${f.teams?.away?.name || '?'}`,
    league: f.league?.name || '',
    status: f.fixture?.status?.short || '',
    elapsed: f.fixture?.status?.elapsed ?? null,
  }))
  return { fixtures: list, latency: res.latency }
}

// ─── Odds fetch + coverage per fixture ───────────────────────────────────────

async function auditFixtureOdds(fixture) {
  const res = await apiGet(`/odds?fixture=${fixture.fixtureId}`)
  const warnings = []
  const marketSet = new Set()
  const bookmakerSet = new Set()
  let totalOdds = 0
  let unknownMarkets = 0

  if (!res.ok) warnings.push(`odds_http_${res.status}`)
  const apiErrors = res.json?.errors
  if (apiErrors && (Array.isArray(apiErrors) ? apiErrors.length : Object.keys(apiErrors).length)) {
    warnings.push(`api_errors:${JSON.stringify(apiErrors).slice(0, 120)}`)
  }

  const response = res.json?.response || []
  for (const entry of response) {
    for (const bm of entry.bookmakers || []) {
      bookmakerSet.add(bm.name)
      for (const bet of bm.bets || []) {
        const mt = mapBetName(bet.name)
        marketSet.add(mt)
        if (mt === 'custom_unknown') unknownMarkets++
        for (const v of bet.values || []) {
          const odd = parseFloat(v.odd)
          if (!isNaN(odd) && odd > 0) totalOdds++
        }
      }
    }
  }

  if (response.length === 0) warnings.push('no_odds_returned')
  const isLive = ['1H', '2H', 'HT', 'ET', 'BT', 'P'].includes(fixture.status)
  if (isLive) warnings.push('live_match_prematch_odds_endpoint')

  return {
    fixtureId: fixture.fixtureId,
    matchLabel: fixture.matchLabel,
    league: fixture.league,
    status: fixture.status,
    elapsed: fixture.elapsed,
    totalOdds,
    bookmakersFound: [...bookmakerSet],
    marketsFound: [...marketSet],
    hasMatchWinner: marketSet.has('match_winner'),
    hasOverUnderGoals: marketSet.has('over_under_goals'),
    hasBothTeamsScore: marketSet.has('both_teams_score'),
    hasCorners: marketSet.has('corners'),
    hasCards: marketSet.has('cards'),
    hasAsianHandicap: marketSet.has('asian_handicap'),
    hasNextGoal: marketSet.has('next_goal'),
    unknownMarkets,
    oddsTiming: isLive ? 'unknown' : 'pre_match',
    latency: res.latency,
    warnings,
  }
}

// ─── /odds/live feasibility probe ────────────────────────────────────────────

async function probeLiveOdds() {
  const res = await apiGet('/odds/live')
  const apiErrors = res.json?.errors
  const errStr = apiErrors ? JSON.stringify(apiErrors).toLowerCase() : ''
  const requiresUpgrade = res.status === 403 || errStr.includes('plan') || errStr.includes('subscription') || errStr.includes('not available')
  const response = res.json?.response || []
  let markets = 0, bookmakers = 0
  for (const entry of response) {
    const bms = entry.bookmakers || entry.odds || []
    bookmakers += Array.isArray(bms) ? bms.length : 0
    for (const bm of (Array.isArray(bms) ? bms : [])) markets += (bm.bets || bm.odds || []).length
  }
  return {
    httpStatus: res.status,
    available: res.ok && response.length > 0 && !requiresUpgrade,
    requiresUpgrade,
    fixturesReturned: response.length,
    marketsReturned: markets,
    bookmakersReturned: bookmakers,
    latencyMs: res.latency,
    error: res.error || (errStr ? errStr.slice(0, 160) : undefined),
  }
}

// ─── Summary + D3 recommendation ─────────────────────────────────────────────

function buildSummary(reports, liveProbe) {
  const total = reports.length
  const withOdds = reports.filter(r => r.totalOdds > 0).length
  const coveragePercent = total > 0 ? Math.round((withOdds / total) * 100) : 0
  const bookmakerAvg = total > 0 ? Math.round((reports.reduce((s, r) => s + r.bookmakersFound.length, 0) / total) * 10) / 10 : 0

  const marketHit = (key) => reports.filter(r => r[key]).length
  const coverageByMarket = {
    match_winner: marketHit('hasMatchWinner'),
    over_under_goals: marketHit('hasOverUnderGoals'),
    both_teams_score: marketHit('hasBothTeamsScore'),
    corners: marketHit('hasCorners'),
    cards: marketHit('hasCards'),
    asian_handicap: marketHit('hasAsianHandicap'),
    next_goal: marketHit('hasNextGoal'),
  }

  // Alert type support
  const foundUnion = new Set()
  for (const r of reports) for (const m of r.marketsFound) foundUnion.add(m)
  const strong = [], weak = [], unsupported = []
  for (const [alertType, markets] of Object.entries(ALERT_MARKETS)) {
    const found = markets.filter(m => foundUnion.has(m))
    if (found.length === markets.length) strong.push(alertType)
    else if (found.length > 0) weak.push(alertType)
    else unsupported.push(alertType)
  }

  // D3 recommendation
  let recommendationForD3
  if (liveProbe.available) {
    recommendationForD3 = 'D3 — API-Football Live Odds Integration'
  } else if (coveragePercent < 30) {
    recommendationForD3 = 'D3 — Secondary Odds Provider Research/Integration'
  } else if (coverageByMarket.corners === 0 && coverageByMarket.cards === 0) {
    recommendationForD3 = 'D3 — Odds UI Refinement + Coverage Warnings (corners/cards missing)'
  } else {
    recommendationForD3 = 'D3 — Pre-Match Odds Context Enhancement'
  }

  return {
    fixturesTested: total,
    fixturesWithOdds: withOdds,
    fixturesWithoutOdds: total - withOdds,
    coveragePercent,
    bookmakerAverage: bookmakerAvg,
    coverageByMarket,
    strongSupportedAlertTypes: strong,
    weakSupportedAlertTypes: weak,
    unsupportedAlertTypes: unsupported,
    liveOddsFeasibility: liveProbe,
    recommendationForD3,
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== GoalSense DB-Free API-Football Odds Audit ===`)
  console.log(`Source: ${SOURCE} | Limit: ${LIMIT}\n`)

  if (!API_KEY) {
    console.log('❌ No API key found. Set ODDS_API_KEY, API_FOOTBALL_KEY, or API_FOOTBALL_KEYS')
    console.log('   (checked process.env, backend/.env, root .env)\n')
    process.exitCode = 1
    return
  }
  console.log(`✅ API key resolved (${API_KEY.length} chars, hidden)\n`)

  // 1. Fetch fixtures
  console.log(`--- Fetching fixtures (source=${SOURCE}) ---`)
  const fx = await fetchFixtures(SOURCE, LIMIT)
  if (fx.error) {
    console.log(`❌ ${fx.error}`)
    if (fx.raw?.json?.errors) console.log(JSON.stringify(fx.raw.json.errors, null, 2))
    // Surface account/plan issues clearly
    const errStr = JSON.stringify(fx.raw?.json?.errors || '').toLowerCase()
    if (errStr.includes('suspend')) console.log('\n⚠️  API-Football account is SUSPENDED. Resolve at the provider dashboard before auditing.\n')
    else if (errStr.includes('plan') || errStr.includes('subscription')) console.log('\n⚠️  This request requires a higher API-Football plan.\n')
    process.exitCode = 1
    return
  }
  console.log(`Found ${fx.fixtures.length} fixtures (latency ${fx.latency}ms)\n`)
  if (fx.fixtures.length === 0) {
    console.log('⚠️  No fixtures returned for this source. Try --source today or --source upcoming.\n')
  }

  // 2. Audit odds per fixture
  console.log(`--- Auditing odds per fixture ---`)
  const reports = []
  for (const fixture of fx.fixtures) {
    const report = await auditFixtureOdds(fixture)
    reports.push(report)
    const flags = `MW:${report.hasMatchWinner ? '✓' : '✗'} O/U:${report.hasOverUnderGoals ? '✓' : '✗'} BTTS:${report.hasBothTeamsScore ? '✓' : '✗'} Corners:${report.hasCorners ? '✓' : '✗'} Cards:${report.hasCards ? '✓' : '✗'} AH:${report.hasAsianHandicap ? '✓' : '✗'}`
    console.log(`  ${report.matchLabel} [${report.league}] (${report.status})`)
    console.log(`    odds=${report.totalOdds} bookmakers=${report.bookmakersFound.length} ${flags}`)
    if (report.warnings.length) console.log(`    ⚠️  ${report.warnings.join(', ')}`)
  }

  // 3. Live odds feasibility
  console.log(`\n--- /odds/live feasibility probe ---`)
  const liveProbe = await probeLiveOdds()
  console.log(JSON.stringify(liveProbe, null, 2))

  // 4. Summary
  console.log(`\n--- Coverage Summary ---`)
  const summary = buildSummary(reports, liveProbe)
  console.log(JSON.stringify(summary, null, 2))
  console.log(`\n📊 Recommendation for D3: ${summary.recommendationForD3}\n`)

  // 5. Optional JSON output
  if (WRITE_JSON) {
    const outPath = resolve(ROOT, 'odds-audit-result.json')
    writeFileSync(outPath, JSON.stringify({ source: SOURCE, limit: LIMIT, generatedAt: new Date().toISOString(), summary, reports }, null, 2))
    console.log(`💾 Saved to ${outPath}\n`)
  }

  console.log('=== Audit complete ===\n')
}

main().catch(err => { console.error('Audit failed:', err?.message || err); process.exitCode = 1 })
