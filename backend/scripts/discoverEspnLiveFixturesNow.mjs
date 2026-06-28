#!/usr/bin/env node
/**
 * Discover ESPN Live Fixtures Now — B57 Operational Script
 * ─────────────────────────────────────────────────────────────────────────────
 * Discovers current live fixtures available from ESPN for monitoring.
 * Usage: node backend/scripts/discoverEspnLiveFixturesNow.mjs
 */
import { discoverLiveFixturesNow, explainLiveFixtureSelection } from '../dist/modules/footballIntelligence/live/espnLiveFixtureDiscovery.service.js'

async function main() {
  try {
    console.log('🔍 Discovering ESPN live fixtures...')

    const discovery = await discoverLiveFixturesNow()

    console.log('\n📊 Discovery Results:')
    console.log(`Total fixtures found: ${discovery.totalFound}`)
    console.log(`Selected for monitoring: ${discovery.selected.length}`)
    console.log(`Skipped: ${discovery.skipped.length}`)

    if (discovery.limitations.length > 0) {
      console.log('\n⚠️  Limitations:')
      discovery.limitations.forEach(limitation => console.log(`  • ${limitation}`))
    }

    if (discovery.selected.length > 0) {
      console.log('\n✅ Selected fixtures:')
      discovery.selected.forEach((fixture, index) => {
        console.log(`${index + 1}. ${fixture.teams} (${fixture.competition})`)
        console.log(`   Status: ${fixture.status}${fixture.minute ? ` min ${fixture.minute}` : ''}`)
        console.log(`   Score: ${fixture.score.home}-${fixture.score.away}`)
        console.log(`   Data: ${fixture.dataAvailability}`)
        console.log(`   Reason: ${fixture.selectionReason}`)
        if (fixture.limitations.length > 0) {
          console.log(`   Issues: ${fixture.limitations.join(', ')}`)
        }
      })
    }

    if (discovery.skipped.length > 0) {
      console.log('\n❌ Skipped fixtures:')
      discovery.skipped.forEach((skip, index) => {
        console.log(`${index + 1}. ${skip.fixtureId}: ${skip.reason}`)
      })
    }

    // Demo: explain selection for first fixture
    if (discovery.selected.length > 0) {
      const firstFixture = discovery.selected[0]
      console.log(`\n🔍 Selection explanation for ${firstFixture.fixtureId}:`)
      const explanation = await explainLiveFixtureSelection(firstFixture.fixtureId)
      console.log(`Found: ${explanation.found}`)
      console.log(`Selected: ${explanation.selected}`)
      console.log(`Reason: ${explanation.reason}`)
      if (explanation.details) {
        console.log(`Details:`, explanation.details)
      }
    }

    process.exitCode = 0

  } catch (error) {
    console.error('❌ Discovery failed:', error.message)
    process.exitCode = 1
  }
}

main()
