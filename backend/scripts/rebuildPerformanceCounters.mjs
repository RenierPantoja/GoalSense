/**
 * Rebuild ALL performance counters (Phase E7) — SAFE BY DEFAULT (dry-run).
 * ─────────────────────────────────────────────────────────────────────────────
 * Drives the existing, validated per-pattern rebuild endpoint
 * (POST /api/performance/rebuild/:patternId) for every pattern. The endpoint
 * recomputes the counter from raw alerts/resolutions (AlertResolution is the
 * source of truth), so this is idempotent and never inflates metrics.
 *
 * The rebuild route is dev/admin only (returns 403 when APP_ENV=production), so
 * this script inherits that protection.
 *
 * Usage (backend must be running):
 *   node scripts/rebuildPerformanceCounters.mjs              # dry-run: list patterns only
 *   node scripts/rebuildPerformanceCounters.mjs --confirm    # actually rebuild each pattern
 *   node scripts/rebuildPerformanceCounters.mjs --base http://localhost:4000 --confirm
 */
import { parseFlags } from './_firebase.mjs'

const flags = parseFlags(process.argv)
const BASE = flags.arg('base', 'http://localhost:4000')

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`)
  return { ok: res.ok, status: res.status, json: await res.json().catch(() => ({})) }
}
async function postJson(path) {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  return { ok: res.ok, status: res.status, json: await res.json().catch(() => ({})) }
}

async function main() {
  console.log(`\n=== Rebuild Performance Counters (${flags.confirm ? 'CONFIRM' : 'DRY-RUN'}) ===\nBackend: ${BASE}\n`)

  const list = await getJson('/api/patterns')
  if (!list.ok) { console.log(`❌ Could not list patterns (status ${list.status}). Is the backend running?`); process.exit(1) }
  const patterns = (list.json.data || []).filter(p => p.status !== 'archived')
  console.log(`Active/non-archived patterns: ${patterns.length}`)

  if (!flags.confirm) {
    for (const p of patterns) console.log(`  would rebuild: ${p.id}  (${p.name})`)
    console.log('\nDry-run only. Re-run with --confirm to rebuild all counters.\n')
    return
  }

  let ok = 0, fail = 0
  for (const p of patterns) {
    const r = await postJson(`/api/performance/rebuild/${p.id}`)
    if (r.ok) { ok++; console.log(`  ✓ ${p.name} (${p.id})`) }
    else { fail++; console.log(`  ✗ ${p.name} (${p.id}) — status ${r.status} ${r.json?.error || ''}`) }
  }
  console.log(`\nDone. Rebuilt ${ok}, failed ${fail}.\n`)
}

main().catch(err => { console.error('Rebuild failed:', err.message); process.exit(1) })
