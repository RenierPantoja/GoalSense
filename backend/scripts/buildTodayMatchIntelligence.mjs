import { buildTodayValidationPlan } from '../dist/modules/footballIntelligence/validation/localValidationPlan.service.js'
import { buildMatchIntelligencePackageV5 } from '../dist/modules/footballIntelligence/matchIntelligencePackageV5.service.js'
import { evaluateAlertCandidate } from '../dist/modules/footballIntelligence/governance/alertDecisionGovernor.service.js'

async function buildIntelligence() {
  console.log('--- GoalSense B54: Match Intelligence Build (Day 3) ---')

  const plan = await buildTodayValidationPlan()
  const selected = plan.fixtures.filter(f => f.selected)

  console.log(`Building packages for ${selected.length} fixtures...\n`)

  for (const f of selected) {
    console.log(`[Fixture ${f.fixtureId}] ${f.teams}`)

    const pkg = await buildMatchIntelligencePackageV5(f.fixtureId)
    if (!pkg) {
      console.log('  -> Package build returned null.')
      continue
    }

    console.log(`  Influence Summary: ${pkg.influenceSummary}`)
    if (pkg.blockingVariables.length > 0) console.log(`  Blocking Vars: ${pkg.blockingVariables.map(v => v.variableName).join(', ')}`)
    if (pkg.waitVariables.length > 0) console.log(`  Wait Vars: ${pkg.waitVariables.map(v => v.variableName).join(', ')}`)
    if (pkg.conflicts.length > 0) console.log(`  Conflicts: ${pkg.conflicts.length}`)

    // Evaluate Governance (will check readiness, precheck and holds inside)
    const gov = await evaluateAlertCandidate({
      fixtureId: f.fixtureId,
      source: 'manual_review',
      metadata: { note: 'B54 Day 3 Real Validation Build' }
    })

    console.log(`  Governance Action: ${gov.action} (Mode: ${gov.mode})`)
    if (gov.blockers.length > 0) console.log(`  Blockers: ${gov.blockers.join(', ')}`)
    if (gov.waitReasons.length > 0) console.log(`  Wait: ${gov.waitReasons.join(', ')}`)
    if (gov.stayOutReasons.length > 0) console.log(`  Stay Out: ${gov.stayOutReasons.join(', ')}`)
    console.log('')
  }

  console.log('--- Summary ---')
  console.log('Intelligence built successfully. Governance evaluated in observe mode.')
  console.log('Proceed to Local Validation Run.')
}

buildIntelligence().catch(console.error)
