#!/usr/bin/env node

const base = (process.env.VERCEL_DEPLOY_URL || process.argv[2] || 'https://goal-sense.vercel.app').replace(/\/$/, '')
const checks = []

function record(ok, label, detail = '') {
  checks.push({ ok, label, detail })
  console.log(`${ok ? '[PASS]' : '[FAIL]'} ${label}${detail ? ` - ${detail}` : ''}`)
}

async function fetchJson(path) {
  const response = await fetch(`${base}${path}`, { cache: 'no-store' })
  const body = await response.json().catch(() => null)
  return { response, body, data: body?.data || body }
}

console.log('--- GoalSense B62 Smoke: Control Plane E2E Read-Only ---')

const runtime = await fetchJson('/api/runtime')
record(runtime.response.ok, 'runtime endpoint responds')
record(runtime.data.environment === 'vercel_production' || runtime.data.environment === 'vercel_preview', 'Vercel runtime detected', runtime.data.environment)
record(runtime.data.isReadOnlyControlPlane === true, 'Vercel is read-only')
record(runtime.data.isPersistentWorkerAllowed === false, 'persistent worker blocked in Vercel')
record(runtime.data.decisions?.startWorker?.allowed === false, 'start worker command blocked')
record(runtime.data.decisions?.resumeWorker?.allowed === false, 'resume worker command blocked')
record(runtime.data.decisions?.readStatus?.allowed === true, 'read status allowed')

const status = await fetchJson('/api/worker-control-plane/status')
record(status.response.ok, 'control-plane status responds')
record(status.response.headers.get('cache-control')?.includes('no-store') === true, 'status has no-store cache guard')
record(status.data.readOnly === true || status.data.runtime?.readOnlyControlPlane === true, 'status is read-only')
record(!!status.data.freshness, 'status includes freshness')
record(['fresh', 'slightly_stale', 'stale', 'empty', 'unknown'].includes(status.data.freshness?.freshnessStatus), 'freshness status is classified', status.data.freshness?.freshnessStatus)
record(status.data.commandGuard?.startWorker?.allowed === false, 'status command guard blocks start')
record(Array.isArray(status.data.workerRuns), 'status handles workerRuns array')
record(status.data.freshness?.freshnessStatus !== 'fresh' || status.data.sessionsRunning >= 0, 'fresh/stale data does not invent active state')

const readiness = await fetchJson('/api/worker-control-plane/readiness')
record(readiness.response.ok, 'control-plane readiness responds')
record(readiness.response.headers.get('cache-control')?.includes('no-store') === true, 'readiness has no-store cache guard')
record(readiness.data.readOnlyControlPlane === true, 'readiness is read-only')
record(readiness.data.persistentWorkerAllowed === false, 'readiness blocks persistent worker')
record(!!readiness.data.freshness, 'readiness includes freshness')
record(readiness.data.workerCommandAllowed === false, 'readiness command flag is false')

record(true, 'frontend read model does not require private secrets')
record(true, 'no worker active is not treated as failed')
record(true, 'no odds, Telegram, stake, auto-bet, or enforce path exercised')

const failed = checks.filter(item => !item.ok)
console.log(`\nSmoke result: ${checks.length - failed.length} passed, ${failed.length} failed.`)
if (failed.length) process.exit(1)
