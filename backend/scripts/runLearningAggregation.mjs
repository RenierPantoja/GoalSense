/**
 * Manual Learning Aggregation runner (Phase B13).
 * ─────────────────────────────────────────────────────────────────────────────
 * Recomputes the learning profiles from the existing B12 memory. Idempotent and
 * non-destructive (overwrites profiles via deterministic ids). Creates NO alerts,
 * invents NO data. Requires a built dist/ and (for real writes) Firebase creds.
 *
 * Usage:
 *   node scripts/runLearningAggregation.mjs                 # aggregate all
 *   node scripts/runLearningAggregation.mjs --pattern=<id>  # one pattern
 *   node scripts/runLearningAggregation.mjs --dry-run       # compute, persist nothing
 *
 * Build first: npm run build
 */
import 'dotenv/config'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const patternArg = args.find(a => a.startsWith('--pattern='))
const patternId = patternArg ? patternArg.split('=')[1] : undefined

async function main() {
  let agg
  try {
    agg = await import('../dist/modules/intelligence/learning/learningAggregator.service.js')
  } catch (e) {
    console.error('Could not import dist aggregator. Run `npm run build` first.')
    console.error(e?.message || e)
    process.exit(1)
  }

  console.log(`[learning] Aggregating${patternId ? ` pattern=${patternId}` : ' ALL'}${dryRun ? ' (dry-run)' : ''}...`)
  const run = patternId
    ? await agg.aggregatePattern(patternId, { dryRun })
    : await agg.aggregateAll({ dryRun })

  console.log('[learning] Run summary:')
  console.log(`  status:              ${run.status}`)
  console.log(`  ledger scanned:      ${run.ledgerEntriesScanned}`)
  console.log(`  outcomes scanned:    ${run.outcomesScanned}`)
  console.log(`  failures scanned:    ${run.failuresScanned}`)
  console.log(`  pattern profiles:    ${run.patternProfiles}`)
  console.log(`  competition profiles:${run.competitionProfiles}`)
  console.log(`  team profiles:       ${run.teamProfiles}`)
  console.log(`  context stats:       ${run.contextStats}`)
  console.log(`  recommendations:     ${run.recommendations}`)
  console.log(`  learning events:     ${run.learningEventsCreated}`)
  if (run.notes.length) console.log(`  notes:               ${run.notes.join(' | ')}`)
  console.log(run.status === 'completed' ? '[learning] OK' : '[learning] FAILED')
  process.exit(run.status === 'completed' ? 0 : 1)
}

main()
