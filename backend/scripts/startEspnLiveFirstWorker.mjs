#!/usr/bin/env node

process.env.DATABASE_URL ||= 'file:./local.db'

function argValue(name, fallback) {
  const idx = process.argv.indexOf(name)
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback
}

const maxDurationMinutes = Number(argValue('--duration', process.env.ESPN_LIVE_FIRST_MAX_SESSION_MINUTES || 180))
const maxFixtures = Number(argValue('--max-fixtures', process.env.ESPN_LIVE_FIRST_MAX_FIXTURES || 5))
const pollIntervalSeconds = Number(argValue('--poll', process.env.ESPN_LIVE_FIRST_POLL_INTERVAL_SECONDS || 45))
const mode = process.argv.includes('--scheduled') ? 'local_scheduled' : 'local_manual'

const { startWorkerRun } = await import('../dist/modules/footballIntelligence/live/espnLiveFirstPersistentWorker.service.js')

const result = await startWorkerRun({ mode, maxDurationMinutes, maxFixtures, pollIntervalSeconds })
console.log(JSON.stringify({
  success: result.success,
  workerRunId: result.workerRunId,
  message: result.message,
  safety: {
    telegram: 'off',
    enforce: 'off',
    odds: 'not_used',
    externalAlerts: 'not_sent',
  },
}, null, 2))

if (!result.success) process.exit(1)
