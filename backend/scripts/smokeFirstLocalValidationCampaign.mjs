/**
 * Smoke — First Local Validation Campaign (B50). PURE + Noop only.
 * ─────────────────────────────────────────────────────────────────────────────
 * Verifies offline: env example contains NO secret; controlled-beta classifier is
 * conservative (no provider/firebase → internal_alpha/not_ready; <7 reports → not
 * possible; enforce without validation → blocked); campaign summary warns on short
 * campaigns; enforce stays off; Noop-safe.
 *
 * Build first: npm run build
 * Usage: node scripts/smokeFirstLocalValidationCampaign.mjs
 */
import { readFileSync } from 'node:fs'
const FAILURES = []
function assert(c, m) { if (!c) { FAILURES.push(m); console.log(`  [FAIL] ${m}`) } else console.log(`  [ok] ${m}`) }
async function load(p) { try { return await import(p) } catch (e) { console.error(`Could not import ${p}. Run \`npm run build\` first.`); console.error(e?.message || e); process.exit(1) } }

const beta = await load('../dist/modules/footballIntelligence/validation/controlledBetaReadiness.service.js')
const campaign = await load('../dist/modules/footballIntelligence/validation/validationCampaign.service.js')

console.log('[smoke] env example has no secret:')
{
  let txt = ''
  try { txt = readFileSync(new URL('../.env.local.validation.example', import.meta.url), 'utf8') } catch { /* */ }
  assert(txt.length > 0, 'env example file exists')
  assert(/API_FOOTBALL_KEY=\s*$/m.test(txt), 'API_FOOTBALL_KEY is empty (no real key)')
  assert(!/-----BEGIN PRIVATE KEY-----/.test(txt), 'no private key block in example')
  assert(!/AIza[0-9A-Za-z_-]{30,}/.test(txt), 'no Google API key pattern in example')
  assert(/ENABLE_ALERT_GOVERNANCE_ENFORCE=false/.test(txt), 'enforce documented OFF')
  assert(/TELEGRAM_ENABLED=false/.test(txt), 'Telegram documented OFF')
}

console.log('[smoke] controlled-beta classifier is conservative:')
{
  const noProvider = beta.classifyControlledBeta({ firebaseConfigured: true, providerConfigured: false, enforceOn: false, telegramOn: false, dailyReports: 10 })
  assert(noProvider === 'internal_alpha', 'no provider → internal_alpha (even with reports)')
  const nothing = beta.classifyControlledBeta({ firebaseConfigured: false, providerConfigured: false, enforceOn: false, telegramOn: false, dailyReports: 0 })
  assert(nothing === 'not_ready', 'no firebase/provider/reports → not_ready')
  const fewReports = beta.classifyControlledBeta({ firebaseConfigured: true, providerConfigured: true, enforceOn: false, telegramOn: false, dailyReports: 3 })
  assert(fewReports === 'internal_alpha', 'provider+firebase but <7 reports → internal_alpha (not possible)')
  const ready = beta.classifyControlledBeta({ firebaseConfigured: true, providerConfigured: true, enforceOn: false, telegramOn: false, dailyReports: 9 })
  assert(ready === 'controlled_beta_possible', 'provider+firebase+>=7 reports → controlled_beta_possible')
  const enforceNoVal = beta.classifyControlledBeta({ firebaseConfigured: true, providerConfigured: true, enforceOn: true, telegramOn: false, dailyReports: 2 })
  assert(enforceNoVal === 'blocked', 'enforce ON without validation → blocked')
}

console.log('[smoke] campaign summary warns on short campaigns:')
{
  const shortC = { id: 'c1', title: 't', startedAt: 'x', endedAt: null, status: 'running', targetDays: 14, actualDays: 2, dailyReportIds: ['a', 'b'], aggregateMetrics: { fixturesAnalyzed: 4, fixturesWithData: 2, governanceEvaluations: 3, causalEvaluable: 1, causalNotEvaluable: 5, providerLimitedFixtures: 2 }, blockers: [], warnings: [], finalRecommendation: '', limitations: [] }
  const sum = campaign.buildCampaignSummary(shortC)
  assert(sum.warnings.some(w => /dia/i.test(w)), 'short campaign → days warning')
  assert(/insuficiente|Continuar/i.test(sum.recommendation), 'short campaign → continue recommendation (no beta)')
  const longC = { ...shortC, actualDays: 9, aggregateMetrics: { ...shortC.aggregateMetrics, causalEvaluable: 30, fixturesWithData: 20 } }
  const sum2 = campaign.buildCampaignSummary(longC)
  assert(/revisar bloqueadores|beta/i.test(sum2.recommendation), 'longer campaign → review-blockers recommendation (still no guarantee)')
}

console.log('[smoke] Noop repo safe — daily reports/campaigns read empty:')
{
  const { NoopIntelligenceRepository } = await load('../dist/repositories/noopIntelligence.repository.js')
  const repo = new NoopIntelligenceRepository()
  const report = { id: '2026-06-20', date: '2026-06-20' }
  assert((await repo.saveDailyValidationReport(report)).id === '2026-06-20', 'Noop saves daily report (returns input)')
  assert((await repo.getDailyValidationReport('2026-06-20')) === null, 'Noop get daily report → null')
  assert((await repo.listDailyValidationReports()).length === 0, 'Noop list daily reports → []')
  const camp = { id: 'vcamp_x', title: 't' }
  assert((await repo.saveValidationCampaign(camp)).id === 'vcamp_x', 'Noop saves campaign')
  assert((await repo.getValidationCampaign('vcamp_x')) === null, 'Noop get campaign → null')
  assert((await repo.listValidationCampaigns()).length === 0, 'Noop list campaigns → []')
  assert((await repo.updateValidationCampaign('vcamp_x', { status: 'completed' })).count === 0, 'Noop update campaign → count 0')
}

if (FAILURES.length > 0) { console.log(`[smoke] FAILED (${FAILURES.length}): ${FAILURES.join(' | ')}`); process.exitCode = 1 }
else console.log('[smoke] OK')
