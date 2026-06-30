#!/usr/bin/env node
/** Close Signal Quality Campaign — B70 CLI */
process.env.DATABASE_URL ||= 'file:./local.db'

function arg(name, fallback) { const i = process.argv.indexOf(name); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback }
const campaignArg = arg('--campaign', 'latest')

const { createRepositories } = await import('../dist/repositories/index.js')
const runner = await import('../dist/modules/footballIntelligence/live/signalQuality/signalQualityCampaignRunner.service.js')
const repos = createRepositories()

const campaign = campaignArg === 'latest'
  ? await repos.intelligence.getLatestSignalQualityCampaign()
  : await repos.intelligence.getSignalQualityCampaign(campaignArg)
if (!campaign) { console.error('No campaign found.'); process.exit(1) }

const status = (campaign.limitations && campaign.limitations.length > 1) ? 'completed_with_warnings' : 'completed'
await runner.updateCampaignStatus(campaign.id, status)
console.log(JSON.stringify({ campaignId: campaign.id, status }, null, 2))
process.exit(0)
