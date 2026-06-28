#!/usr/bin/env node

process.env.DATABASE_URL ||= 'file:./local.db'

const { runRecoverySweep } = await import('../dist/modules/footballIntelligence/live/espnLiveFirstRecovery.service.js')
const result = await runRecoverySweep()
console.log(JSON.stringify(result, null, 2))
