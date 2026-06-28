import { generateDailyValidationReport } from '../dist/modules/footballIntelligence/validation/dailyValidationReport.service.js'
import { buildControlledBetaReadiness } from '../dist/modules/footballIntelligence/validation/controlledBetaReadiness.service.js'
import { createRepositories } from '../dist/repositories/index.js'

async function runDailyReportAndBetaReadiness() {
  console.log('--- GoalSense B53: Daily Report & Beta Readiness (Day 2) ---')

  const today = new Date().toISOString().slice(0, 10)
  console.log(`Generating report for ${today}...\n`)

  const report = await generateDailyValidationReport(today)

  console.log('[ Daily Report Summary ]')
  console.log(`Fixtures Planned: ${report.fixturesPlanned}`)
  console.log(`Fixtures Analyzed: ${report.fixturesAnalyzed}`)
  console.log(`Provider Configured: ${report.providerConfigured}`)
  console.log(`Provider Limited Fixtures: ${report.providerLimitations.length}`)
  console.log(`Manual Intake Used: ${report.manualIntakeUsed}`)
  console.log(`Backend Health: ${report.backendHealth}`)
  console.log(`Go/No-Go Status: ${report.goNoGo}`)

  if (report.recommendedActions.length > 0) {
    console.log('\n[ Recommended Actions ]')
    report.recommendedActions.forEach(a => console.log(`- ${a}`))
  }

  console.log('\n[ Campaign Update ]')
  // We attach it to a campaign "GoalSense Local Validation — Week 1"
  const repos = createRepositories()
  let campaigns = []
  try { campaigns = await repos.intelligence.listValidationCampaigns() } catch { }

  let activeCampaign = campaigns.find(c => c.title === 'GoalSense Local Validation — Week 1')
  if (!activeCampaign) {
    console.log('Creating new campaign: GoalSense Local Validation — Week 1')
    const newCamp = {
      id: `vcamp_${Date.now().toString(36)}`,
      title: 'GoalSense Local Validation — Week 1',
      status: 'running',
      startedAt: new Date().toISOString(),
      targetDays: 14,
      dailyReportIds: [report.id]
    }
    try { await repos.intelligence.saveValidationCampaign(newCamp) } catch { }
  } else {
    console.log('Updating existing campaign...')
    if (!activeCampaign.dailyReportIds.includes(report.id)) {
      activeCampaign.dailyReportIds.push(report.id)
      try { await repos.intelligence.updateValidationCampaign(activeCampaign.id, activeCampaign) } catch { }
    }
  }

  console.log('\n[ Controlled Beta Readiness ]')
  const beta = await buildControlledBetaReadiness()
  console.log(`Status: ${beta.status}`)
  if (beta.hardBlockers.length > 0) {
    console.log('Hard Blockers:')
    beta.hardBlockers.forEach(b => console.log(`  - ${b}`))
  }
  if (beta.softBlockers.length > 0) {
    console.log('Soft Blockers:')
    beta.softBlockers.forEach(b => console.log(`  - ${b}`))
  }

  console.log('\nNext Action:')
  beta.nextActions.forEach(a => console.log(`- ${a}`))
}

runDailyReportAndBetaReadiness().catch(console.error)
