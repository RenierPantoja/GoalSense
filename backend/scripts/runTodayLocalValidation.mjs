import { runValidationForToday } from '../dist/modules/footballIntelligence/validation/localValidationRunner.service.js'

async function runLocalValidation() {
  console.log('--- GoalSense B54: Local Validation Run (Day 3) ---')
  console.log('Starting validation run for today...')

  const run = await runValidationForToday()

  console.log(`Run ID: ${run.id}`)
  console.log(`Status: ${run.status}`)
  console.log(`Mode: ${run.mode}`)
  console.log(`Provider Mode: ${run.providerMode}`)
  console.log(`Governance Mode: ${run.governanceMode}`)
  console.log(`Causal Mode: ${run.causalMode}`)
  console.log(`Fixtures Selected: ${run.selectedFixtures}`)
  console.log(`Duration: ${run.durationMinutes} min`)

  if (run.warnings.length > 0) {
    console.log('\nWarnings:')
    run.warnings.forEach(w => console.log(`- ${w}`))
  }

  console.log('\nLimitations:')
  run.limitations.forEach(l => console.log(`- ${l}`))

  console.log('\n--- Summary ---')
  console.log('Local Validation Run complete. Metrics collected.')
  console.log('Proceed to Post-Match Causal Review if any matches finished.')
}

runLocalValidation().catch(console.error)
