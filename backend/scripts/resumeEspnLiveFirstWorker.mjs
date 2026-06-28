#!/usr/bin/env node

process.env.DATABASE_URL ||= 'file:./local.db'

const workerRunId = process.argv[2] || process.argv[process.argv.indexOf('--worker-run-id') + 1]
if (!workerRunId || workerRunId === process.argv[0]) {
  console.error('Usage: node scripts/resumeEspnLiveFirstWorker.mjs <workerRunId>')
  process.exit(1)
}

const { resumeWorkerRun } = await import('../dist/modules/footballIntelligence/live/espnLiveFirstPersistentWorker.service.js')
const result = await resumeWorkerRun(workerRunId)
console.log(JSON.stringify(result, null, 2))
if (!result.success) process.exit(1)
