/**
 * Manual Pattern Backtest runner (Phase B14).
 * ─────────────────────────────────────────────────────────────────────────────
 * Re-evaluates a pattern over recorded snapshots. Read-only: creates NO alerts,
 * sends NO Telegram, touches NO production counters. Requires a built dist/ and
 * (for real writes) Firebase creds in backend/.env.
 *
 * Usage:
 *   node scripts/runPatternBacktest.mjs --pattern=<id>
 *   node scripts/runPatternBacktest.mjs --pattern=<id> --maxFixtures=50
 *   node scripts/runPatternBacktest.mjs --pattern=<id> --dry-run
 *
 * Build first: npm run build
 */
import 'dotenv/config'

const args = process.argv.slice(2)
const get = (name) => { const a = args.find(x => x.startsWith(`--${name}=`)); return a ? a.split('=')[1] : undefined }
const patternId = get('pattern')
const maxFixtures = get('maxFixtures')
const dryRun = args.includes('--dry-run')

if (!patternId) {
  console.error('Missing --pattern=<id>. Usage: node scripts/runPatternBacktest.mjs --pattern=<id> [--maxFixtures=N] [--dry-run]')
  process.exit(1)
}

async function main() {
  let engine, guards
  try {
    engine = await import('../dist/modules/intelligence/backtest/backtestEngine.service.js')
    guards = await import('../dist/modules/intelligence/backtest/utils/backtestGuards.util.js')
  } catch (e) {
    console.error('Could not import dist backtest engine. Run `npm run build` first.')
    console.error(e?.message || e)
    process.exit(1)
  }

  const v = guards.validateAndNormalizeConfig({ patternId, maxFixtures: maxFixtures ? Number(maxFixtures) : undefined, dryRun })
  if (!v.ok) { console.error(`Invalid config: ${v.error}`); process.exit(1) }

  console.log(`[backtest] pattern=${patternId} maxFixtures=${v.config.maxFixtures}${dryRun ? ' (dry-run)' : ''}...`)
  const run = await engine.runPatternBacktest(v.config)

  console.log(`[backtest] status: ${run.status}${run.error ? ` (${run.error})` : ''}`)
  if (run.summary) {
    const s = run.summary
    console.log(`  fixtures analyzed:  ${s.fixturesAnalyzed}`)
    console.log(`  signals triggered:  ${s.signalsTriggered}`)
    console.log(`  confirmed/partial:  ${s.confirmed}/${s.confirmedPartial}`)
    console.log(`  failed:             ${s.failed}`)
    console.log(`  unknown/n.eval:     ${s.unknown}/${s.notEvaluable}`)
    console.log(`  usefulRate:         ${s.usefulRate == null ? '—' : Math.round(s.usefulRate * 100) + '%'}`)
    console.log(`  failedRate:         ${s.failedRate == null ? '—' : Math.round(s.failedRate * 100) + '%'}`)
    console.log(`  unknownRate:        ${s.unknownRate == null ? '—' : Math.round(s.unknownRate * 100) + '%'}`)
    console.log(`  sampleQuality:      ${s.sampleQuality}`)
    console.log(`  avg trigger minute: ${s.avgTriggerMinute ?? '—'}`)
  }
  if (run.dataCoverage) {
    const c = run.dataCoverage
    console.log(`  coverage: found=${c.fixturesFound} withSnaps=${c.fixturesWithSnapshots} noSnaps=${c.fixturesWithoutSnapshots} snaps=${c.snapshotsEvaluated} rich=${c.richDataCount} partial=${c.partialDataCount} poor=${c.poorDataCount} unknown=${c.unknownDataCount}`)
  }
  if (run.limitations.length) console.log(`  limitations: ${run.limitations.map(l => l.code).join(', ')}`)
  process.exit(run.status === 'completed' ? 0 : 1)
}

main()
