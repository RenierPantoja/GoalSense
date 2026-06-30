#!/usr/bin/env node
/** Create Signal Quality Campaign — B70 CLI */
process.env.DATABASE_URL ||= 'file:./local.db'

function arg(name, fallback) { const i = process.argv.indexOf(name); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback }

const name = arg('--name', 'Live-First Quality Campaign')
const targetWindows = Number(arg('--target-windows', '10'))
const targetCases = Number(arg('--target-cases', '300'))

const { createSignalQualityCampaign } = await import('../dist/modules/footballIntelligence/live/signalQuality/signalQualityCampaignRunner.service.js')
const c = await createSignalQualityCampaign({ name, targetWindows, targetMinimumCases: targetCases })
console.log(JSON.stringify({ campaignId: c.id, name: c.name, status: c.status, targetWindows: c.targetWindows, targetMinimumCases: c.targetMinimumCases }, null, 2))
process.exit(0)
