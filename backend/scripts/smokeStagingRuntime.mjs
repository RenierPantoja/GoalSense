/**
 * Smoke test — Staging Runtime (Phase B28). READ-ONLY against a live backend.
 * ─────────────────────────────────────────────────────────────────────────────
 * Validates a deployed backend WITHOUT side effects: no scans, no alerts, no CSV
 * export, no rebuilds, no Telegram. Empty/honest responses are acceptable.
 *
 * Usage:
 *   BACKEND_URL=https://your-backend node scripts/smokeStagingRuntime.mjs
 *   (optional) AUTH_TOKEN=<firebase id token> to also probe /api/auth/me authed.
 */
const BASE = (process.env.BACKEND_URL || process.env.PUBLIC_BACKEND_URL || '').replace(/\/+$/, '')
const TOKEN = process.env.AUTH_TOKEN || ''

if (!BASE) {
  console.error('[staging-smoke] BACKEND_URL not set — nothing to probe. Set BACKEND_URL=https://… and re-run.')
  process.exit(2)
}

const FAILURES = []
const authHeaders = TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}
function assert(cond, msg) { if (!cond) { FAILURES.push(msg); console.log(`  [FAIL] ${msg}`) } else console.log(`  [ok] ${msg}`) }

async function probe(path, { auth = false } = {}) {
  try {
    const res = await fetch(`${BASE}${path}`, { headers: { 'Content-Type': 'application/json', ...(auth ? authHeaders : {}) } })
    let body = null
    try { body = await res.json() } catch { /* non-json */ }
    return { status: res.status, ok: res.ok, body }
  } catch (e) {
    return { status: 0, ok: false, error: String(e?.message || e) }
  }
}

console.log(`[staging-smoke] target: ${BASE}`)

console.log('[staging-smoke] liveness/readiness:')
{
  const health = await probe('/health')
  assert(health.status === 200, `/health → 200 (got ${health.status})`)
  const apiHealth = await probe('/api/health')
  assert(apiHealth.status === 200, `/api/health → 200 (got ${apiHealth.status})`)
  const ready = await probe('/api/ready')
  assert(ready.status === 200 || ready.status === 503, `/api/ready responds (200 ready / 503 degraded) — got ${ready.status}`)
  if (ready.body) console.log(`        ready=${ready.body.ready} appEnv=${ready.body.appEnv} persistence=${ready.body.persistenceProvider} firebaseInit=${ready.body.firebase?.initialized}`)
}

console.log('[staging-smoke] auth context (no token required):')
{
  const me = await probe('/api/auth/me')
  assert(me.status === 200, `/api/auth/me → 200 (got ${me.status})`)
  if (me.body?.data) console.log(`        authEnabled=${me.body.data.authEnabled} role=${me.body.data.role} mode=${me.body.data.authMode}`)
  if (TOKEN) {
    const meAuth = await probe('/api/auth/me', { auth: true })
    assert(meAuth.status === 200, '/api/auth/me with token → 200')
    if (meAuth.body?.data) console.log(`        (authed) role=${meAuth.body.data.role}`)
  }
}

console.log('[staging-smoke] read-only intelligence endpoints (no side effects):')
{
  const autoStatus = await probe('/api/intelligence/auto-engine/status')
  assert([200].includes(autoStatus.status), `auto-engine/status → 200 (got ${autoStatus.status})`)
  const alertOverview = await probe('/api/intelligence/alerts/overview')
  assert([200, 401, 403].includes(alertOverview.status), `alerts/overview responds honestly (got ${alertOverview.status})`)
  const backtestRuns = await probe('/api/intelligence/backtest/runs')
  assert([200].includes(backtestRuns.status), `backtest/runs → 200 (got ${backtestRuns.status})`)
  const policyOverview = await probe('/api/intelligence/auto-engine/auto-alert-policy/overview')
  assert([200].includes(policyOverview.status), `auto-alert-policy/overview → 200 (got ${policyOverview.status})`)
}

console.log('[staging-smoke] CORS header present:')
{
  // A simple GET should carry an access-control-allow-origin when an Origin is echoed.
  try {
    const res = await fetch(`${BASE}/api/health`, { headers: { Origin: process.env.FRONTEND_ORIGIN || 'https://goal-sense.vercel.app' } })
    const acao = res.headers.get('access-control-allow-origin')
    assert(res.ok, 'health reachable with Origin header')
    console.log(`        access-control-allow-origin: ${acao ?? '(none — check CORS_ALLOWED_ORIGINS)'}`)
  } catch (e) { assert(false, `CORS probe failed: ${String(e?.message || e)}`) }
}

if (FAILURES.length > 0) { console.log(`[staging-smoke] FAILED (${FAILURES.length}): ${FAILURES.join(' | ')}`); process.exitCode = 1 }
else console.log('[staging-smoke] OK — backend is reachable and read-only endpoints respond honestly.')
