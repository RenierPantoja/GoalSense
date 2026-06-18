/**
 * Manual Replay runner (Phase B14) — read-only.
 * ─────────────────────────────────────────────────────────────────────────────
 * Walks a fixture's recorded snapshots and shows, minute by minute, whether the
 * radar would have fired and what was missing. Creates NO alerts, NO Telegram.
 *
 * Usage:
 *   node scripts/replayFixturePattern.mjs --pattern=<id> --fixture=<id>
 *
 * Build first: npm run build
 */
import 'dotenv/config'

const args = process.argv.slice(2)
const get = (name) => { const a = args.find(x => x.startsWith(`--${name}=`)); return a ? a.split('=')[1] : undefined }
const patternId = get('pattern')
const fixtureId = get('fixture')

if (!patternId || !fixtureId) {
  console.error('Usage: node scripts/replayFixturePattern.mjs --pattern=<id> --fixture=<id>')
  process.exit(1)
}

async function main() {
  let replay
  try {
    replay = await import('../dist/modules/intelligence/backtest/replayEngine.service.js')
  } catch (e) {
    console.error('Could not import dist replay engine. Run `npm run build` first.')
    console.error(e?.message || e)
    process.exit(1)
  }

  const run = await replay.replayFixture(patternId, fixtureId, { persist: false })
  console.log(`[replay] ${run.patternName} on ${run.fixtureLabel} (${run.leagueName})`)
  if (run.notes.length) console.log(`  notes: ${run.notes.join(' | ')}`)
  console.log(`  snapshots evaluated: ${run.snapshotsEvaluated}`)
  console.log(`  would trigger:       ${run.wouldTrigger}${run.firstTriggerMinute != null ? ` @ ${run.firstTriggerMinute}'` : ''}`)
  console.log(`  estimated outcome:   ${run.estimatedOutcome} — ${run.outcomeReason}`)
  if (run.timeline.length) {
    console.log('  timeline (last up to 12 points):')
    for (const p of run.timeline.slice(-12)) console.log(`    ${p.explanation}`)
  }
  process.exit(0)
}

main()
