import { buildTodayValidationPlan, isLocalValidationEnabled } from '../dist/modules/footballIntelligence/validation/localValidationPlan.service.js'
import { getAdapter } from '../dist/modules/footballIntelligence/providers/providerRegistry.service.js'

async function runPlan() {
  console.log('--- GoalSense B54: Validation Plan (Day 3) ---')
  if (!isLocalValidationEnabled()) {
    console.warn('[!] Local validation is NOT enabled. Check ENABLE_LOCAL_LONG_RUN_VALIDATION in your env.')
  }

  const plan = await buildTodayValidationPlan()
  const adapter = getAdapter('api_football')
  const isConfigured = adapter?.isConfigured()

  console.log(`Date: ${plan.date}`)
  console.log(`Mode: ${plan.mode}`)
  console.log(`Fixtures Known (ESPN): ${plan.totalFixturesKnown}`)
  console.log(`Selected: ${plan.selectedCount}`)
  console.log(`Skipped: ${plan.skippedCount}`)
  console.log(`Provider Configured: ${isConfigured ? 'yes' : 'no'}`)

  console.log('\n[ Estimated Cost ]')
  console.log(`Provider Calls: ${plan.estimatedProviderCalls}`)
  console.log(`Firebase Reads: ${plan.estimatedFirebaseReads}`)
  console.log(`Firebase Writes: ${plan.estimatedFirebaseWrites}`)

  console.log('\n[ Risks & Mappings ]')
  if (plan.risks.length === 0) console.log('None detected.')
  plan.risks.forEach(r => console.log(`- ${r}`))
  console.log('- Mapping Risk: Operator must review candidates.')
  console.log('- Manual Intake Risk: Will be requested if domain fetch fails.')

  console.log('\n[ Fixtures Plan ]')
  plan.fixtures.forEach(f => {
    const action = f.selected ? `[SELECT] ${f.reasons.join(' ')}` : `[SKIP] ${f.skipReasons.join(' ')}`
    console.log(`- ${f.teams} (${f.competition}) - ${f.status} -> ${action}`)
  })

  console.log('\n[ Next Action ]')
  console.log('If plan is acceptable, proceed to Identity & Mapping prep.')
}

runPlan().catch(console.error)
