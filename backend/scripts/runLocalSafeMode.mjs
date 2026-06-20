/**
 * Local safe-mode pre-flight (Phase B30).
 * ─────────────────────────────────────────────────────────────────────────────
 * Validates the local env BEFORE starting the backend: prints the main flags
 * (NO secrets), warns when a dangerous/cost flag is ON, and recommends the safe
 * profile. Does NOT start workers. Exit 0 = safe to start; exit 1 = review needed.
 *
 * Usage:
 *   node scripts/runLocalSafeMode.mjs           # validate + report
 *   node scripts/runLocalSafeMode.mjs --start   # validate, then start the server
 */
import 'dotenv/config'
import { spawn } from 'node:child_process'

const flag = (v) => String(v).toLowerCase() === 'true'
const get = (k, d) => process.env[k] ?? d

const DANGEROUS = [
  'ENABLE_AUTO_ALERT_CREATE', 'ENABLE_AUTO_ENGINE_TO_ALERTS', 'ENABLE_AUTO_ENGINE_WRITE',
  'TELEGRAM_ENABLED', 'ODDS_ENABLED',
]
const WORKERS = ['LIVE_WORKER_ENABLED', 'PATTERN_WORKER_ENABLED', 'RESOLUTION_WORKER_ENABLED',
  'ENABLE_LEARNING_AGGREGATION_SCHEDULER', 'ENABLE_AUTO_ENGINE_SCHEDULER', 'ENABLE_AUTO_ENGINE_LEARNING_SCHEDULER']

console.log('[local-safe] GoalSense backend local pre-flight')
console.log(`  profile:        ${get('LOCAL_RUNTIME_PROFILE', 'safe_local')}`)
console.log(`  APP_ENV:        ${get('APP_ENV', 'development')}`)
console.log(`  persistence:    ${get('PERSISTENCE_PROVIDER', 'prisma')}`)
console.log(`  auth:           ${flag(get('ENABLE_AUTH')) ? 'ON' : 'off'}`)
console.log(`  rateLimit:      ${flag(get('ENABLE_RATE_LIMIT')) ? 'ON' : 'off'}`)
console.log(`  panel:          ${flag(get('ENABLE_LOCAL_OPERATIONS_PANEL', 'true')) ? 'ON' : 'off'}`)

const dangerOn = DANGEROUS.filter(f => flag(get(f)))
const workersOn = WORKERS.filter(f => flag(get(f)))

console.log(`  dangerous ON:   ${dangerOn.length ? dangerOn.join(', ') : '(none)'} `)
console.log(`  workers ON:     ${workersOn.length ? workersOn.join(', ') : '(none)'} `)

let warn = false
if (dangerOn.length) { console.warn(`[local-safe] WARNING: dangerous flag(s) ON → ${dangerOn.join(', ')}`); warn = true }
if (flag(get('ENABLE_ALERT_EXPORT')) && !flag(get('ENABLE_AUTH'))) { console.warn('[local-safe] WARNING: ENABLE_ALERT_EXPORT ON without auth.'); warn = true }
if (get('LOCAL_RUNTIME_PROFILE', 'safe_local') === 'intensive_debug') { console.warn('[local-safe] WARNING: intensive_debug profile — never use as default.'); warn = true }

const shouldStart = process.argv.includes('--start')
if (warn && !shouldStart) {
  console.log('[local-safe] Review the warnings above before starting (re-run with --start to start anyway).')
  process.exit(1)
}
if (shouldStart) {
  console.log('[local-safe] Starting backend (node dist/server.js)…')
  const child = spawn(process.execPath, ['dist/server.js'], { stdio: 'inherit' })
  child.on('exit', code => process.exit(code ?? 0))
} else {
  console.log('[local-safe] OK — safe to start. Run `npm run local:safe -- --start` or `npm start`.')
  process.exit(0)
}
