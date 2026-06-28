import { buildTodayValidationPlan } from '../dist/modules/footballIntelligence/validation/localValidationPlan.service.js'

async function runManualBaselinePrep() {
  console.log('--- GoalSense B55: Manual Baseline Fallback Prep ---')
  console.log('Provider access is blocked or limited. Preparing manual baseline fallback.\n')

  const plan = await buildTodayValidationPlan()
  const candidates = plan.fixtures.slice(0, 3)

  console.log(`Selected ${candidates.length} fixtures for manual baseline:`)

  candidates.forEach((f, i) => {
    console.log(`\n[${i + 1}] ${f.teams} (${f.competition})`)
    console.log('  Manual Intake Checklist (Go to Backstage):')
    console.log('  [ ] Lineup Status (Requires source & publishedAt)')
    console.log('  [ ] Injuries Status (Requires sourceUrl if claiming none)')
    console.log('  [ ] Suspensions Status (Requires sourceUrl if claiming none)')
    console.log('  [ ] Match Context')
  })

  console.log('\nRules:')
  console.log('- DO NOT auto-fill fake data.')
  console.log('- DO NOT declare "no injuries" without a source.')
  console.log('- Ensure sourceLabel is provided for all records.')

  console.log('\nProceed to Backstage to fill manual records, then run Day 4 Workflow (Route B).')
}

runManualBaselinePrep().catch(console.error)
