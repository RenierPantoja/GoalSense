/**
 * Manual Auto Engine scan runner (Phase B19).
 * ─────────────────────────────────────────────────────────────────────────────
 * Scans live fixtures and prints ranked OPPORTUNITIES. Read-only by default:
 * creates NO alerts, sends NO Telegram, places NO bets, touches NO production
 * counters. Persists opportunities ONLY with --persist AND ENABLE_AUTO_ENGINE_WRITE=true.
 *
 * Requires ENABLE_AUTO_ENGINE=true (otherwise the scan is skipped honestly).
 *
 * Usage:
 *   node scripts/runAutoEngineScan.mjs --dry-run
 *   node scripts/runAutoEngineScan.mjs --limit=30
 *   node scripts/runAutoEngineScan.mjs --persist        (needs ENABLE_AUTO_ENGINE_WRITE=true)
 *
 * Build first: npm run build
 */
import 'dotenv/config'

const args = process.argv.slice(2)
const get = (name) => { const a = args.find(x => x.startsWith(`--${name}=`)); return a ? a.split('=')[1] : undefined }
const dryRun = args.includes('--dry-run')
const persist = args.includes('--persist')
const limit = get('limit') ? Number(get('limit')) : undefined

async function main() {
  let svc
  try {
    svc = await import('../dist/modules/intelligence/autoEngine/autoEngine.service.js')
  } catch (e) {
    console.error('Could not import dist auto engine service. Run `npm run build` first.')
    console.error(e?.message || e)
    process.exit(1)
  }

  if (!svc.isAutoEngineEnabled()) {
    console.log('[auto-engine] ENABLE_AUTO_ENGINE=false — scan will be skipped (honest no-op). Set it to true to run.')
  }
  if (persist && !svc.isAutoEngineWriteEnabled()) {
    console.log('[auto-engine] --persist requested but ENABLE_AUTO_ENGINE_WRITE=false — running dry (nothing will be saved).')
  }

  console.log(`[auto-engine] scan${dryRun ? ' (dry-run)' : ''}${persist ? ' (persist)' : ''}${limit ? ` limit=${limit}` : ''}...`)
  const run = await svc.runAutoEngineScan({ dryRun, persist, limit })

  console.log(`[auto-engine] status: ${run.status} (enabled=${run.enabled}, write=${run.write})`)
  console.log(`  fixtures scanned:   ${run.fixturesScanned}`)
  console.log(`  opportunities:      ${run.opportunitiesFound} (strong=${run.strong} watch=${run.watch} candidate=${run.candidate} blocked=${run.blocked})`)
  if (Object.keys(run.blockReasons).length) {
    console.log('  block reasons:')
    for (const [k, v] of Object.entries(run.blockReasons)) console.log(`    - ${k}: ${v}`)
  }
  const opps = run.opportunities || []
  if (opps.length) {
    console.log('  top opportunities:')
    for (const o of opps.slice(0, 10)) {
      console.log(`    [${o.status}] ${o.score} · ${o.opportunityType} · ${o.fixtureLabel} (${o.minute ?? '?'}') · band=${o.confidenceBand}`)
      console.log(`        ${o.explanation.headline} — ${o.explanation.whyNow.slice(0, 2).join(' ')}`)
    }
  }
  if (run.notes.length) console.log(`  notes: ${run.notes.join(' | ')}`)
  process.exit(run.status === 'failed' ? 1 : 0)
}

main()
