#!/usr/bin/env node
/** Get Signal Quality Campaign Summary — B70 CLI */
process.env.DATABASE_URL ||= 'file:./local.db'

function arg(name, fallback) { const i = process.argv.indexOf(name); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback }
const campaignArg = arg('--campaign', 'latest')

const { createRepositories } = await import('../dist/repositories/index.js')
const runner = await import('../dist/modules/footballIntelligence/live/signalQuality/signalQualityCampaignRunner.service.js')
const repos = createRepositories()

const campaign = campaignArg === 'latest'
  ? await repos.intelligence.getLatestSignalQualityCampaign()
  : await repos.intelligence.getSignalQualityCampaign(campaignArg)
if (!campaign) { console.log(JSON.stringify({ found: false, message: 'No campaign found.' }, null, 2)); process.exit(0) }

const summary = await runner.buildCampaignSummary(campaign.id)
console.log(JSON.stringify({ found: true, ...summary }, null, 2))
process.exit(0)
