import { env } from '../dist/env.js'

async function checkLocalValidationEnv() {
  console.log('--- GoalSense B51: Local Validation Environment Check ---')

  const isTrue = (val) => String(val).toLowerCase() === 'true'

  const firebaseReady = env.PERSISTENCE_PROVIDER === 'firebase'
  const providerKeyPresent = !!env.API_FOOTBALL_KEY && env.API_FOOTBALL_KEY.length > 0
  const providerEnabled = isTrue(env.ENABLE_PROVIDER_API_FOOTBALL)
  const govMode = env.ALERT_GOVERNANCE_MODE || 'observe'
  const enforceEnabled = isTrue(env.ENABLE_ALERT_GOVERNANCE_ENFORCE)
  const telegramEnabled = isTrue(env.TELEGRAM_ENABLED)
  const localValEnabled = isTrue(env.ENABLE_LOCAL_LONG_RUN_VALIDATION)
  const causalEnabled = isTrue(env.ENABLE_CAUSAL_LEARNING)

  console.log(`Firebase ready: ${firebaseReady ? 'yes' : 'no'}`)
  console.log(`Provider API-Football configured: ${providerEnabled && providerKeyPresent ? 'yes' : 'no'} (enabled: ${providerEnabled}, key present: ${providerKeyPresent})`)
  console.log(`Governance mode: ${govMode}`)
  console.log(`Enforce enabled: ${enforceEnabled ? 'yes' : 'no'}`)
  console.log(`Telegram enabled: ${telegramEnabled ? 'yes' : 'no'}`)
  console.log(`Local validation enabled: ${localValEnabled ? 'yes' : 'no'}`)
  console.log(`Causal learning enabled: ${causalEnabled ? 'yes' : 'no'}`)

  const isSafe = !enforceEnabled && !telegramEnabled

  console.log('---------------------------------------------------------')
  console.log(`Safe to run validation: ${isSafe ? 'yes' : 'no'}`)

  if (!isSafe) {
    console.error('\n[!] DANGER: Cannot run validation safely. Please check ENABLE_ALERT_GOVERNANCE_ENFORCE and TELEGRAM_ENABLED.')
    process.exit(1)
  }
}

checkLocalValidationEnv().catch(console.error)
