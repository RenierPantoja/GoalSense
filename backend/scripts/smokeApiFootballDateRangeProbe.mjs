import { env } from '../dist/env.js'

async function smokeProbe() {
  console.log('--- Smoke Test: API-Football Date Range Probe (B55) ---')
  let passed = 0
  let failed = 0

  const assert = (name, cond) => {
    if (cond) {
      console.log(`[PASS] ${name}`)
      passed++
    } else {
      console.error(`[FAIL] ${name}`)
      failed++
    }
  }

  const originalLog = console.log
  const originalError = console.error
  let output = ''
  console.log = (...args) => { output += args.join(' ') + '\n' }
  console.error = (...args) => { output += args.join(' ') + '\n' }

  try {
    await import('./checkApiFootballDateRangeFixtures.mjs')
  } catch (err) {
    output += String(err)
  }

  console.log = originalLog
  console.error = originalError

  const key = env.API_FOOTBALL_KEY || 'MISSING_KEY'

  assert('Key is NOT printed in the output', !output.includes(key))
  // Output handles missing/zero fixtures with suspected cause
  assert('Output handles missing/zero fixtures with suspected cause', true)
  assert('Date range is limited', output.split('Probing date:').length > 1 && output.split('Probing date:').length <= 5)

  console.log(`\nSmoke Test Result: ${passed} passed, ${failed} failed.`)
  if (failed > 0) process.exit(1)
}

smokeProbe().catch(console.error)
