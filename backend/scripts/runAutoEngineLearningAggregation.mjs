/**
 * Manual Auto Engine Learning/Calibration runner (Phase B24).
 * ─────────────────────────────────────────────────────────────────────────────
 * Recomputes the Auto Engine calibration profile from the closed B22/B23 loop
 * (promoted links + outcome summaries + opportunities). Idempotent, observational.
 * Creates NO alerts, invents NO data, never auto-tunes the engine. Requires a built
 * dist/ and (for real writes) Firebase creds.
 *
 * Usage:
 *   node scripts/runAutoEngineLearningAggregation.mjs --dry-run
 *   node scripts/runAutoEngineLearningAggregation.mjs --persist
 *   node scripts/runAutoEngineLearningAggregation.mjs --from=YYYY-MM-DD --to=YYYY-MM-DD
 *
 * Build first: npm run build
 */
import 'dotenv/config'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run') || !args.includes('--persist')
const fromArg = args.find(a => a.startsWith('--from='))
const toArg = args.find(a => a.startsWith('--to='))
const from = fromArg ? fromArg.split('=')[1] : undefined
const to = toArg ? toArg.split('=')[1] : undefined

async function main() {
  let agg
  try {
    agg = await import('../dist/modules/intelligence/autoEngine/autoEngineLearningAggregator.service.js')
  } catch (e) {
    console.error('Could not import dist aggregator. Run `npm run build` first.')
    console.error(e?.message || e)
    process.exit(1)
  }

  console.log(`[auto-learning] Rebuilding calibration${dryRun ? ' (dry-run, nothing persisted)' : ' (PERSIST)'}${from ? ` from=${from}` : ''}${to ? ` to=${to}` : ''}...`)
  const { run, profile } = await agg.rebuildAutoEngineLearningProfiles({ dryRun, from, to })

  console.log('[auto-learning] Run summary:')
  console.log(`  status:               ${run.status}`)
  console.log(`  outcome summaries:    ${run.outcomeSummariesScanned}`)
  console.log(`  promoted links:       ${run.outcomeLinksScanned}`)
  console.log(`  opportunities joined: ${run.opportunitiesJoined}`)
  console.log(`  resolved sample:      ${run.sampleSize}`)
  console.log(`  recommendations:      ${run.recommendations}`)
  console.log(`  learning events:      ${run.learningEventsCreated}`)
  if (profile) {
    console.log(`  usefulRate:           ${profile.usefulRate == null ? '—' : Math.round(profile.usefulRate * 100) + '%'}`)
    console.log(`  unknownRate:          ${profile.unknownRate == null ? '—' : Math.round(profile.unknownRate * 100) + '%'}`)
    console.log(`  sampleQuality:        ${profile.sampleQuality}`)
    const topTypes = profile.opportunityTypeProfiles.slice(0, 5).map(t => `${t.opportunityType}(${t.sampleSize})`).join(', ')
    console.log(`  top opportunityTypes: ${topTypes || '—'}`)
    console.log(`  top limitations:      ${profile.limitations.slice(0, 3).join(' | ')}`)
  }
  if (run.notes.length) console.log(`  notes:                ${run.notes.join(' | ')}`)
  console.log(run.status === 'completed' ? '[auto-learning] OK' : '[auto-learning] FAILED')
  process.exit(run.status === 'completed' ? 0 : 1)
}

main()
