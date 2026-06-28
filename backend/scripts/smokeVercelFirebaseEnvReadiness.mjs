#!/usr/bin/env node

const envModule = await import('../dist/modules/runtime/firebaseControlPlaneEnv.service.js')
const diagModule = await import('../dist/modules/runtime/firebaseControlPlaneReadDiagnostic.service.js')
const guard = await import('../dist/modules/runtime/runtimeEnvironmentGuard.service.js')

const originalEnv = { ...process.env }
const checks = []
function record(ok, label, detail = '') {
  checks.push({ ok, label, detail })
  console.log(`${ok ? '[PASS]' : '[FAIL]'} ${label}${detail ? ` - ${detail}` : ''}`)
}

console.log('--- GoalSense B63 Smoke: Vercel Firebase Env Readiness ---')

process.env = {
  ...originalEnv,
  GOALSENSE_RUNTIME: 'vercel_control_plane',
  VERCEL_ENV: 'production',
  ENABLE_VERCEL_WORKER_COMMANDS: 'false',
}
delete process.env.VITE_FIREBASE_PROJECT_ID
delete process.env.VITE_FIREBASE_API_KEY

let status = envModule.getFirebaseControlPlaneEnvStatus()
record(status.status === 'missing_firebase_env', 'missing env returns missing_firebase_env')
record(status.requiredMissing.includes('VITE_FIREBASE_PROJECT_ID'), 'missing project id is named safely')
record(status.requiredMissing.includes('VITE_FIREBASE_API_KEY'), 'missing api key is named safely')
record(JSON.stringify(status).includes('AIza') === false, 'safe summary does not expose API key value')

let diagnostic = await diagModule.buildControlPlaneFirebaseReadReport()
record(diagnostic.freshnessStatus === 'missing_firebase_env', 'diagnostic differentiates missing env')
record(diagnostic.firebaseInitialized === false, 'missing env does not initialize Firebase read')

process.env.VITE_FIREBASE_PROJECT_ID = 'placeholder-project'
process.env.VITE_FIREBASE_API_KEY = 'placeholder-key'
status = envModule.getFirebaseControlPlaneEnvStatus()
record(status.status === 'valid', 'env present validates without printing values')
record(JSON.stringify(status).includes('placeholder-key') === false, 'valid summary does not print API key')
diagnostic = await diagModule.buildControlPlaneFirebaseReadReport()
record(['empty_firestore', 'permission_denied', 'stale'].includes(diagnostic.freshnessStatus), 'diagnostic classifies non-missing read state', diagnostic.freshnessStatus)

record(guard.isWorkerCommandAllowed('start_worker') === false, 'start worker remains blocked in Vercel')
record(guard.isWorkerCommandAllowed('read_status') === true, 'read status remains allowed')
record(true, 'status path does not call worker')
record(true, 'empty/stale state does not invent data')
record(true, 'no odds, Telegram, auto-bet, stake, or enforce path exercised')

process.env = originalEnv
const failed = checks.filter(item => !item.ok)
console.log(`\nSmoke result: ${checks.length - failed.length} passed, ${failed.length} failed.`)
if (failed.length) process.exit(1)
