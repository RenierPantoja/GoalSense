#!/usr/bin/env node

console.log('--- GoalSense B61 Smoke: Vercel Control Plane Safety ---')

const guard = await import('../dist/modules/runtime/runtimeEnvironmentGuard.service.js')
const gate = await import('../dist/modules/runtime/workerCommandSafetyGate.service.js')

let passed = 0
let failed = 0

function check(name, condition, details = '') {
  if (condition) {
    passed += 1
    console.log(`[PASS] ${name}${details ? ` - ${details}` : ''}`)
  } else {
    failed += 1
    console.error(`[FAIL] ${name}${details ? ` - ${details}` : ''}`)
  }
}

const vercelEnv = {
  VERCEL: '1',
  VERCEL_ENV: 'production',
  GOALSENSE_RUNTIME: 'vercel_control_plane',
  ENABLE_VERCEL_WORKER_COMMANDS: 'false',
}
const localWorkerEnv = {
  GOALSENSE_RUNTIME: 'local_worker',
  ENABLE_LOCAL_WORKER_COMMANDS: 'true',
}
const localDevEnv = {
  GOALSENSE_RUNTIME: 'local_dev',
  ENABLE_LOCAL_WORKER_COMMANDS: 'true',
}

check('runtime vercel_control_plane detects production', guard.detectRuntimeEnvironment(vercelEnv) === 'vercel_production')
check('vercel blocks start worker', guard.isWorkerCommandAllowed('start_worker', vercelEnv) === false)
check('vercel blocks resume worker', guard.isWorkerCommandAllowed('resume_worker', vercelEnv) === false)
check('vercel blocks long polling loop', guard.isWorkerCommandAllowed('long_polling_loop', vercelEnv) === false)
check('vercel allows read status', guard.isWorkerCommandAllowed('read_status', vercelEnv) === true)
check('vercel is read-only control plane', guard.isReadOnlyControlPlane(vercelEnv) === true)

check('local_worker allows start worker', guard.isWorkerCommandAllowed('start_worker', localWorkerEnv) === true)
check('local_worker allows recovery', guard.isWorkerCommandAllowed('recovery_sweep', localWorkerEnv) === true)
check('local_worker allows post-match sweeper', guard.isWorkerCommandAllowed('post_match_sweeper', localWorkerEnv) === true)
check('local_dev does not allow start worker by default policy', guard.isWorkerCommandAllowed('start_worker', localDevEnv) === false)
check('local_dev can stop/recover safely with local flag', guard.isWorkerCommandAllowed('stop_worker', localDevEnv) === true)

const originalEnv = { ...process.env }
process.env.GOALSENSE_RUNTIME = 'vercel_control_plane'
process.env.VERCEL = '1'
process.env.VERCEL_ENV = 'production'
process.env.ENABLE_VERCEL_WORKER_COMMANDS = 'false'
const blocked = gate.assertWorkerCommandAllowed('start_worker')
check('disabled command returns blocked_by_runtime_guard', blocked.allowed === false && blocked.response.status === 'blocked_by_runtime_guard')
check('blocked response contains safe action', blocked.allowed === false && blocked.response.safeAction.includes('read status only'))

process.env = { ...originalEnv, GOALSENSE_RUNTIME: 'local_worker', ENABLE_LOCAL_WORKER_COMMANDS: 'true' }
const allowed = gate.assertWorkerCommandAllowed('start_worker')
check('local worker gate allows start', allowed.allowed === true)

check('enforce remains off', String(process.env.ENABLE_ALERT_GOVERNANCE_ENFORCE || 'false').toLowerCase() !== 'true')
check('Telegram remains off', String(process.env.TELEGRAM_ENABLED || 'false').toLowerCase() !== 'true')
check('odds remain off', String(process.env.ODDS_ENABLED || 'false').toLowerCase() !== 'true')
check('Noop fallback does not affect guard', guard.explainRuntimeGuardDecision('read_status', {}).allowed === true)

process.env = originalEnv

console.log(`\nSmoke result: ${passed} passed, ${failed} failed.`)
if (failed > 0) process.exit(1)
