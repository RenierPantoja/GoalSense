import { env } from '../dist/env.js'
import { getAdapter } from '../dist/modules/footballIntelligence/providers/providerRegistry.service.js'

async function probeDateRange() {
  console.log('--- GoalSense B55: Date Range Provider Probe ---')

  const adapter = getAdapter('api_football')
  if (!adapter || !adapter.isConfigured()) {
    console.warn('[!] Provider is NOT configured. Probe aborted.')
    return
  }

  const baseDate = new Date()
  const datesToTest = [-1, 0, 1, 2].map(offset => {
    const d = new Date(baseDate)
    d.setDate(d.getDate() + offset)
    return d.toISOString().slice(0, 10)
  })

  let anyDataAvailable = false

  for (const dateStr of datesToTest) {
    console.log(`\nProbing date: ${dateStr}...`)
    try {
      const res = await adapter.fetchDomain('today_fixtures', { date: dateStr })
      const list = res.canonicalData?.fixtures || []

      console.log(`  Request Attempted: true`)
      console.log(`  Status Category: ${res.availability}`)
      console.log(`  Fixtures Count: ${list.length}`)

      let suspectedCause = 'unknown'
      if (list.length === 0) {
        const lims = res.limitations?.join(' ') || ''
        if (lims.includes('cota') || lims.includes('credencial')) suspectedCause = 'quota_or_plan_or_credential_invalid'
        else suspectedCause = 'no_fixtures_for_date_or_timezone_mismatch'
      } else {
        anyDataAvailable = true
        suspectedCause = 'none'
      }

      console.log(`  Suspected Cause: ${suspectedCause}`)
      if (res.limitations && res.limitations.length > 0) {
        console.log(`  Limitations: ${res.limitations.join('; ')}`)
      }

      if (list.length > 0) {
        console.log(`  Safe Sample (first 2):`)
        list.slice(0, 2).forEach(f => {
          console.log(`    - [${f.id}] ${f.home} vs ${f.away} (${f.competition}) @ ${f.kickoff}`)
        })
      }

      // Artificial delay to respect rate limits
      await new Promise(r => setTimeout(r, 1000))
    } catch (err) {
      console.log(`  Request Attempted: true`)
      console.log(`  Status Category: error`)
      console.log(`  Suspected Cause: provider_error`)
      console.error(`  Error: ${err.message}`)
    }
  }

  console.log('\n--- Summary ---')
  if (anyDataAvailable) {
    console.log('provider_data_available=true')
    console.log('Recommendation: Use a date with fixtures > 0 as a sanity check.')
  } else {
    console.log('provider_access_blocked_or_plan_limited=true')
    console.log('Recommendation: Review API plan/quota in the provider dashboard (do not paste key here).')
  }
}

probeDateRange().catch(console.error)
