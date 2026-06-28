import { buildTodayValidationPlan } from '../dist/modules/footballIntelligence/validation/localValidationPlan.service.js'
import { resolveFixtureIdentity, buildCandidatesForToday } from '../dist/modules/footballIntelligence/identity/fixtureIdentityResolution.service.js'
import { deriveEntityMappings } from '../dist/modules/footballIntelligence/identity/providerEntityMappingDerivation.service.js'
import { explainDomainUnlockMatrix } from '../dist/modules/footballIntelligence/identity/providerBridge.service.js'

async function runIdentityPrep() {
  console.log('--- GoalSense B54: Identity & Mapping Prep (Day 3) ---')

  const plan = await buildTodayValidationPlan()
  const selected = plan.fixtures.filter(f => f.selected)

  console.log(`Processing ${selected.length} selected fixtures from the plan...\n`)

  const provider = 'api_football'

  console.log('--- Resolving Fixture Candidates ---')
  const resolutionRun = await buildCandidatesForToday(plan.date, provider)
  console.log(`Run Status: ${resolutionRun.status}`)
  console.log(`Primary Fixtures (ESPN): ${resolutionRun.primaryFixtures}`)
  console.log(`Secondary Fixtures (API-Football): ${resolutionRun.secondaryFixtures}`)
  console.log(`Candidates Generated: ${resolutionRun.candidatesGenerated}`)
  console.log(`Auto Confirmed: ${resolutionRun.autoConfirmed}`)
  console.log(`Ambiguous: ${resolutionRun.ambiguous}`)
  if (resolutionRun.limitations.length > 0) {
    resolutionRun.limitations.forEach(l => console.log(`  - ${l}`))
  }

  if (resolutionRun.candidatesGenerated === 0) {
    console.log('\n[!] Diagnosis for 0 candidates:')
    console.log('- Check if dates/timezones are misaligned between ESPN and Provider.')
    console.log('- Check if API-Football returned empty or error in Health Check.')
    console.log('- Check if team/competition names are extremely disparate.')
  }
  console.log('')

  let confirmedFix = 0
  let ambiguousFix = 0
  let missingFix = 0

  for (const f of selected) {
    const res = await resolveFixtureIdentity(f.fixtureId, provider)
    const m = res.mapping
    let status = m ? m.status : 'missing'
    if (status === 'auto_confirmed' || status === 'manually_confirmed') confirmedFix++
    else if (status === 'ambiguous') ambiguousFix++
    else missingFix++

    console.log(`[Fixture ${f.fixtureId}] ${f.teams}`)
    console.log(`  Mapping: ${status}`)

    // Evaluate matrix
    const matrixExplain = await explainDomainUnlockMatrix(f.fixtureId, provider)
    console.log(`  Matrix:  ${matrixExplain}`)
  }

  console.log('\n--- Deriving Team & Competition Mappings ---')
  const run = await deriveEntityMappings(provider)
  console.log(`Status: ${run.status}`)
  console.log(`Teams: ${run.teamAutoConfirmed} confirmed, ${run.teamAmbiguous} ambiguous, ${run.teamCandidates} candidates.`)
  console.log(`Competitions: ${run.competitionAutoConfirmed} confirmed, ${run.competitionAmbiguous} ambiguous, ${run.competitionCandidates} candidates.`)

  if (run.limitations.length > 0) {
    console.log(`Limitations:`)
    run.limitations.forEach(l => console.log(`  - ${l}`))
  }

  console.log('\n--- Next Actions ---')
  if (ambiguousFix > 0 || run.teamAmbiguous > 0 || run.competitionAmbiguous > 0 || resolutionRun.candidatesGenerated > 0) {
    console.log('[!] Operator intervention required to review and confirm mappings.')
  }
  console.log('Proceed to Manual Review if candidates exist, or Critical Acquisition Prep.')
}

runIdentityPrep().catch(console.error)
