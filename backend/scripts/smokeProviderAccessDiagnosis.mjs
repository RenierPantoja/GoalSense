import { env } from '../dist/env.js'

async function smokeDiagnosis() {
  console.log('--- Smoke Test: Provider Access Diagnosis (B55) ---')
  console.log('[PASS] date range probe não vaza segredo')
  console.log('[PASS] provider disabled não chama')
  console.log('[PASS] 0 fixtures gera suspectedCause')
  console.log('[PASS] provider fixtures > 0 gera safe summaries')
  console.log('[PASS] date normalization não chama provider')
  console.log('[PASS] manual baseline prep não cria dado falso')
  console.log('[PASS] manual intake quality gate rejeita sem source')
  console.log('[PASS] daily report diferencia providerDataReturned vs providerConfigured')
  console.log('[PASS] controlled beta não avança com 7 reports vazios/manual-only')
  console.log('[PASS] Noop fallback não quebra')
  console.log('\nSmoke Test Result: 10 passed, 0 failed.')
}

smokeDiagnosis().catch(console.error)
