import { buildTodayValidationPlan } from '../dist/modules/footballIntelligence/validation/localValidationPlan.service.js'
import { runCriticalDomainAcquisitionForFixture } from '../dist/modules/footballIntelligence/preMatchAcquisitionRunner.service.js'

async function runCriticalAcquisition() {
  console.log('--- GoalSense B54: Critical Acquisition (Day 3) ---')

  const plan = await buildTodayValidationPlan()
  const selected = plan.fixtures.filter(f => f.selected)

  console.log(`Running acquisition for ${selected.length} selected fixtures...\n`)

  let fetchedTotal = 0

  for (const f of selected) {
    console.log(`[Fixture ${f.fixtureId}] ${f.teams}`)
    const report = await runCriticalDomainAcquisitionForFixture(f.fixtureId)

    fetchedTotal += report.domainsFetched.length

    console.log(`  Fetched: ${report.domainsFetched.join(', ') || 'none'}`)
    console.log(`  Blocked: ${report.domainsBlocked.join(', ') || 'none'}`)

    if (report.domainsFetched.length === 0) {
      console.log('  -> [!] Diagnosis for 0 domains fetched:')
      console.log('     - Verify if the fixture mapping is missing or unconfirmed.')
      console.log('     - Check if provider endpoints returned empty/unavailable.')
    }

    if (report.domainsProviderNotConfigured.length > 0) console.log(`  No Env: ${report.domainsProviderNotConfigured.join(', ')}`)
    if (report.domainsEndpointMissingDocs.length > 0) console.log(`  Missing Docs/Unsupported: ${report.domainsEndpointMissingDocs.join(', ')}`)

    if (report.domainsManualRecommended.length > 0) {
      console.log(`  -> Manual Intake Recommended:`)
      report.domainsManualRecommended.forEach(d => console.log(`     - ${d}`))
    }

    console.log('')
  }

  console.log('--- Summary ---')
  console.log(`Total Domains Fetched: ${fetchedTotal}`)
  console.log('Manual Intake Checklist:')
  console.log('- Critical: Lineups, Injuries, Suspensions')
  console.log('- Rules: Need sourceType, sourceLabel, enteredBy. No invented data.')
  console.log('\nProceed to Intelligence Build.')
}

runCriticalAcquisition().catch(console.error)
