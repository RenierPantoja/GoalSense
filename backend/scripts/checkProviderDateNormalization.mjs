import { env } from '../dist/env.js'

async function checkDateNormalization() {
  console.log('--- GoalSense B55: Provider Date Normalization Check ---')

  const now = new Date()
  const todayLocal = now.toLocaleDateString()
  const todayUTC = now.toISOString().slice(0, 10)

  // API-Football typically uses the date in YYYY-MM-DD format.
  // Timezone defaults to the API default if not specified, often UTC or Europe/London depending on the endpoint.
  // Our system requests `todayUTC`.

  const providerDate = todayUTC
  const timezoneUsed = 'UTC (Implicit)'

  console.log(`Local Date: ${todayLocal}`)
  console.log(`UTC Date: ${todayUTC}`)
  console.log(`Date to send to provider: ${providerDate}`)
  console.log(`Timezone assumed for request: ${timezoneUsed}`)

  const warnings = []
  if (todayLocal !== todayUTC) {
    warnings.push('Local date differs from UTC date. This might cause boundary issues (fetching yesterday/tomorrow matches).')
  }

  if (warnings.length > 0) {
    console.log('\nWarnings:')
    warnings.forEach(w => console.log(`- ${w}`))
  } else {
    console.log('\nNo timezone warnings detected for the current boundary.')
  }
}

checkDateNormalization().catch(console.error)
