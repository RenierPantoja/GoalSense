import { env } from '../dist/env.js'
import { getAdapter } from '../dist/modules/footballIntelligence/providers/providerRegistry.service.js'

async function checkApiFootballTodayFixtures() {
  console.log('--- GoalSense B54: API-Football Health Check ---')

  const adapter = getAdapter('api_football')
  const isEnabled = String(env.ENABLE_PROVIDER_API_FOOTBALL).toLowerCase() === 'true'
  const hasKey = !!env.API_FOOTBALL_KEY

  console.log(`Provider Enabled: ${isEnabled}`)
  console.log(`Key Present: ${hasKey}`)

  if (!adapter || !adapter.isConfigured()) {
    console.warn('[!] Provider is NOT fully configured (disabled or missing key). Aborting fetch attempt.')
    return
  }

  console.log('\nAttempting to fetch today_fixtures...')
  const dateStr = new Date().toISOString().slice(0, 10)

  try {
    const res = await adapter.fetchDomain('today_fixtures', { date: dateStr })

    console.log(`\n[ Result ]`)
    console.log(`Status Category: ${res.availability}`)

    const list = res.canonicalData?.fixtures || []
    console.log(`Fixtures Count: ${list.length}`)
    console.log(`Provider Date Used: ${dateStr}`)

    if (list.length === 0) {
      console.log('\n[!] Diagnosis for 0 fixtures:')
      console.log('- Verify if the timezone/date parameter aligns with the provider.')
      console.log('- Verify if your API plan covers the requested date.')
      console.log('- Check if there are truly no matches today in the covered leagues.')
      console.log(`Raw limitations returned: ${res.limitations?.join('; ') || 'None'}`)
    } else {
      console.log('\n[ Sample (first 3 safe summaries) ]')
      list.slice(0, 3).forEach((f, i) => {
        console.log(`  ${i + 1}. [${f.id}] ${f.home} vs ${f.away} (${f.competition})`)
      })
    }
  } catch (err) {
    console.error(`\n[!] Error during fetch:`)
    const msg = String(err.message || err)
    if (msg.includes('401') || msg.includes('403')) {
      console.error('- Authentication Error (401/403). The key might be invalid.')
    } else if (msg.includes('429')) {
      console.error('- Rate Limit Error (429). Quota exceeded.')
    } else {
      console.error(`- ${msg}`)
    }
    console.error('Note: Keys/Headers are suppressed for security.')
  }
}

checkApiFootballTodayFixtures().catch(console.error)
