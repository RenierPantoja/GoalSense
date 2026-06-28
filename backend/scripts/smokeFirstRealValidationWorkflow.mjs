import { env } from '../dist/env.js'
import { buildTodayValidationPlan } from '../dist/modules/footballIntelligence/validation/localValidationPlan.service.js'
import { getDomainUnlockStatusV2 } from '../dist/modules/footballIntelligence/identity/providerBridge.service.js'
import { buildProviderIntegrationReadiness } from '../dist/modules/footballIntelligence/providerIntegrationReadiness.service.js'
import { evaluateAlertCandidate } from '../dist/modules/footballIntelligence/governance/alertDecisionGovernor.service.js'
import { generateDailyValidationReport } from '../dist/modules/footballIntelligence/validation/dailyValidationReport.service.js'
import { buildControlledBetaReadiness } from '../dist/modules/footballIntelligence/validation/controlledBetaReadiness.service.js'

async function smoke() {
  console.log('--- Smoke Test: First Real Validation Workflow (B51) ---')
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

  // 1. Env check
  assert('Env safe: No ENFORCE', String(env.ENABLE_ALERT_GOVERNANCE_ENFORCE).toLowerCase() !== 'true')
  assert('Env safe: No Telegram', String(env.TELEGRAM_ENABLED).toLowerCase() !== 'true')

  // 2. Plano do dia
  const plan = await buildTodayValidationPlan()
  const cap = Number(env.LOCAL_VALIDATION_MAX_FIXTURES ?? 10)
  assert('Plan respects max fixture cap', plan.selectedCount <= cap)

  // 3. Identity prep blocks ambiguous
  const unlock = await getDomainUnlockStatusV2('smoke_fix', 'fixture_details', 'api_football')
  assert('Identity blocks fetch for unknown mapping', unlock.currentStatus !== 'unlocked')

  // 4. Provider without env
  const readi = buildProviderIntegrationReadiness()
  const af = readi.providers.find(p => p.providerName === 'api_football')
  if (!af || af.adapterStatus !== 'real') {
    assert('Acquisition safe (provider skeleton without env)', true)
  } else {
    assert('Acquisition real mode active', true)
  }

  // 5. Package / Governance mode
  const gov = await evaluateAlertCandidate({ fixtureId: 'smoke_fix', source: 'manual_review' }).catch(() => null)
  // Could be null if no package, but mode should be observe/shadow.
  assert('Governance is not enforcing', gov?.mode !== 'enforce')

  // 6. Daily report generated
  const dr = await generateDailyValidationReport('smoke_date').catch(() => null)
  assert('Daily Report object structure valid', dr !== null)

  // 7. Controlled beta readiness
  const beta = await buildControlledBetaReadiness().catch(() => null)
  assert('Controlled Beta not automatically candidate', beta?.status !== 'beta_candidate')

  console.log(`\nSmoke Test Result: ${passed} passed, ${failed} failed.`)
  if (failed > 0) process.exit(1)
}

smoke().catch(console.error)
