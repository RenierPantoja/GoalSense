#!/usr/bin/env node

process.env.DATABASE_URL ||= 'file:./local.db'

const fixtureId = process.argv[2] || null
const sessionId = process.argv[3] || undefined
const sweeper = await import('../dist/modules/footballIntelligence/live/espnLiveFirstPostMatchSweeper.service.js')

const result = fixtureId
  ? await sweeper.runEspnLiveFirstPostMatchSweeper(fixtureId, sessionId)
  : await sweeper.runPostMatchSweeper()

console.log(JSON.stringify(result, null, 2))
