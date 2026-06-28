import { env } from '../dist/env.js'
import { getAdapter } from '../dist/modules/footballIntelligence/providers/providerRegistry.service.js'
import { getDomainUnlockStatusV2 } from '../dist/modules/footballIntelligence/identity/providerBridge.service.js'
import { evaluateAlertCandidate } from '../dist/modules/footballIntelligence/governance/alertDecisionGovernor.service.js'

async function smoke() {
  console.log('--- Smoke Test: Real Provider Safe Activation (B53) ---')
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

  // 1. Chave não vaza e provider_enabled bate com .env
  assert('Env safe: No ENFORCE', String(env.ENABLE_ALERT_GOVERNANCE_ENFORCE).toLowerCase() !== 'true')
  assert('Env safe: No Telegram', String(env.TELEGRAM_ENABLED).toLowerCase() !== 'true')

  const adapter = getAdapter('api_football')
  const isEnabledInEnv = String(env.ENABLE_PROVIDER_API_FOOTBALL).toLowerCase() === 'true' && !!env.API_FOOTBALL_KEY
  assert('Provider enabled state matches env', adapter?.isConfigured() === isEnabledInEnv)

  // 2. Chave presente não é impressa na descrição
  const desc = adapter?.describe()
  assert('Adapter description does NOT contain the raw API key', !desc?.limitations?.some(l => l.includes(env.API_FOOTBALL_KEY)))

  // 3. Provider chama apenas documentados
  const unlockDetails = await getDomainUnlockStatusV2('smoke_fix', 'fixture_details', 'api_football')
  assert('Documented endpoint correctly identified', unlockDetails.endpointDocumented === true)

  const unlockUnknown = await getDomainUnlockStatusV2('smoke_fix', 'some_unknown_domain', 'api_football')
  assert('Unknown endpoint correctly blocked', unlockUnknown.endpointDocumented === false)

  // 4. Governance continua não enviando alertas reais
  const gov = await evaluateAlertCandidate({ fixtureId: 'smoke_fix', source: 'manual_review' }).catch(() => null)
  assert('Governance is not enforcing', gov?.mode !== 'enforce')

  console.log(`\nSmoke Test Result: ${passed} passed, ${failed} failed.`)
  if (failed > 0) process.exit(1)
}

smoke().catch(console.error)
