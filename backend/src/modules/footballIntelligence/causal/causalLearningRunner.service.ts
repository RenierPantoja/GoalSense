/**
 * Causal Learning Runner (B48 / Bloco 5).
 * ─────────────────────────────────────────────────────────────────────────────
 * Manual-first orchestration: builds cases, generates insights, derives conservative
 * calibration suggestions, persists everything and emits observational LearningEvents.
 * Scheduler OFF by default. Non-fatal; never changes runtime/score/patterns/enforce;
 * under Noop it returns supported:false with empty results.
 */
import { createRepositories } from '../../../repositories/index.js'
import { env } from '../../../env.js'
import { buildCaseForAlert, buildCasesForFixture, buildCaseForOutcome } from './causalLearningCaseBuilder.service.js'
import { generateInsightsForCase } from './causalInsightGenerator.service.js'
import {
  suggestGovernancePolicyRefinements, suggestVariableInfluenceRefinements,
  suggestMemoryRefinements, suggestDataAcquisitionRefinements, suggestLiveRecheckRefinements,
} from './calibrationSuggestion.service.js'
import type { CausalLearningCase, CausalLearningRun } from './causalLearning.types.js'

export function isCausalLearningEnabled(): boolean { return String(env.ENABLE_CAUSAL_LEARNING).toLowerCase() === 'true' }
export function isCausalBuildEnabled(): boolean { return String(env.ENABLE_CAUSAL_LEARNING_BUILD).toLowerCase() === 'true' }
export function isCausalSchedulerEnabled(): boolean { return String(env.ENABLE_CAUSAL_LEARNING_SCHEDULER).toLowerCase() === 'true' }
function maxFixtures(): number { return Number(env.CAUSAL_LEARNING_MAX_FIXTURES_PER_RUN ?? 20) }
function maxCases(): number { return Number(env.CAUSAL_LEARNING_MAX_CASES_PER_RUN ?? 200) }

let seq = 0
function runId(): string { seq = (seq + 1) % 1e9; return `clr_${Date.now().toString(36)}_${seq.toString(36)}` }

function newRun(scope: CausalLearningRun['scope'], fixtureIds: string[]): CausalLearningRun {
  return { id: runId(), scope, fixtureIds, startedAt: new Date().toISOString(), completedAt: null, status: 'running', casesAnalyzed: 0, insightsCreated: 0, suggestionsCreated: 0, notEvaluableCount: 0, notes: [], error: null, limitations: ['Aprendizado causal observacional; sugestões exigem revisão humana; não altera runtime.'] }
}

async function emitLearningEvent(type: any, fixtureId: string | null, message: string): Promise<void> {
  const repos = createRepositories()
  try {
    await repos.intelligence.createLearningEvent({
      id: `le_causal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      type, fixtureId, alertId: null, patternId: null, contextKey: 'causal_learning', message,
      evidenceRef: null, confidence: 'low', source: 'causal_learning', createdAt: new Date().toISOString(),
    } as any)
  } catch { /* noop */ }
}

async function persistAndLearn(run: CausalLearningRun, cases: CausalLearningCase[]): Promise<CausalLearningRun> {
  const repos = createRepositories()
  const capped = cases.slice(0, maxCases())
  let insights = 0
  for (const c of capped) {
    try { await repos.intelligence.saveCausalLearningCase(c) } catch { /* noop */ }
    void emitLearningEvent('causal_case_created', c.fixtureId, `Caso causal ${c.classification} (link ${c.linkStrength}).`)
    const caseInsights = generateInsightsForCase(c)
    for (const ins of caseInsights) { try { await repos.intelligence.saveCausalLearningInsight(ins) } catch { /* noop */ } }
    if (caseInsights.length) void emitLearningEvent('causal_insight_created', c.fixtureId, `${caseInsights.length} insight(s) gerados.`)
    insights += caseInsights.length
  }

  // Calibration suggestions across the analyzed cases (conservative, min-sample gated).
  const govSuggestions = [
    ...suggestGovernancePolicyRefinements(capped),
    ...suggestMemoryRefinements(capped),
    ...suggestDataAcquisitionRefinements(capped),
    ...suggestLiveRecheckRefinements(capped),
  ]
  const infSuggestions = suggestVariableInfluenceRefinements(capped)
  for (const s of govSuggestions) { try { await repos.intelligence.saveGovernanceCalibrationSuggestion(s) } catch { /* noop */ }; void emitLearningEvent('governance_calibration_suggested', null, s.suggestedChange) }
  for (const s of infSuggestions) { try { await repos.intelligence.saveVariableInfluenceCalibrationSuggestion(s) } catch { /* noop */ }; void emitLearningEvent('influence_calibration_suggested', null, s.suggestedMagnitudeChange) }

  const notEvaluable = capped.filter(c => !c.evaluable).length
  const finished: CausalLearningRun = {
    ...run, status: 'completed', completedAt: new Date().toISOString(),
    casesAnalyzed: capped.length, insightsCreated: insights, suggestionsCreated: govSuggestions.length + infSuggestions.length, notEvaluableCount: notEvaluable,
    notes: [`${capped.length} casos, ${insights} insights, ${govSuggestions.length + infSuggestions.length} sugestões, ${notEvaluable} não avaliáveis.`],
  }
  try { await repos.intelligence.updateCausalLearningRun(run.id, finished) } catch { /* noop */ }
  void emitLearningEvent('causal_learning_run_completed', null, finished.notes[0])
  return finished
}

function disabledRun(scope: CausalLearningRun['scope']): CausalLearningRun {
  return { ...newRun(scope, []), status: 'skipped', completedAt: new Date().toISOString(), notes: ['ENABLE_CAUSAL_LEARNING_BUILD=false — build desligado (sem efeito).'] }
}

export async function runCausalLearningForFixture(fixtureId: string): Promise<CausalLearningRun> {
  if (!isCausalBuildEnabled()) return disabledRun('fixture')
  const run = newRun('fixture', [fixtureId])
  try { await createRepositories().intelligence.createCausalLearningRun(run) } catch { /* noop */ }
  const cases = await buildCasesForFixture(fixtureId).catch(() => [])
  return persistAndLearn(run, cases)
}

export async function runCausalLearningForAlert(alertId: string): Promise<CausalLearningRun> {
  if (!isCausalBuildEnabled()) return disabledRun('alert')
  const repos = createRepositories()
  const run = newRun('alert', [])
  try { await repos.intelligence.createCausalLearningRun(run) } catch { /* noop */ }
  // Find the alert's fixture/pattern via outcome or ledger.
  const outcome = await repos.intelligence.getAlertOutcomeByAlertId(alertId).catch(() => null)
  const ledger = await repos.intelligence.getSignalLedgerEntryByAlertId(alertId).catch(() => null)
  const fixtureId = outcome?.fixtureId ?? (ledger as any)?.fixtureId ?? null
  const patternId = outcome?.patternId ?? (ledger as any)?.patternId ?? null
  if (!fixtureId) return persistAndLearn(run, [])
  const c = await buildCaseForAlert(alertId, fixtureId, patternId).catch(() => null)
  return persistAndLearn(run, c ? [c] : [])
}

export async function runCausalLearningForGovernanceResult(resultId: string): Promise<CausalLearningRun> {
  if (!isCausalBuildEnabled()) return disabledRun('governance_result')
  const repos = createRepositories()
  const run = newRun('governance_result', [])
  try { await repos.intelligence.createCausalLearningRun(run) } catch { /* noop */ }
  const gr = await repos.intelligence.getAlertDecisionGovernanceResult(resultId).catch(() => null)
  if (!gr) return persistAndLearn(run, [])
  const c = gr.candidateAlertId
    ? await buildCaseForAlert(gr.candidateAlertId, gr.fixtureId, gr.patternId).catch(() => null)
    : null
  return persistAndLearn(run, c ? [c] : [])
}

export async function runCausalLearningForToday(): Promise<CausalLearningRun> {
  if (!isCausalBuildEnabled()) return disabledRun('today')
  const repos = createRepositories()
  const run = newRun('today', [])
  try { await repos.intelligence.createCausalLearningRun(run) } catch { /* noop */ }
  const cap = maxFixtures()
  let live: any[] = []
  try { live = await repos.fixtures.listLive(['FT', 'AET', 'PEN', '2H', 'HT'], cap) } catch { /* noop */ }
  const all: CausalLearningCase[] = []
  for (const f of live.slice(0, cap)) {
    const cs = await buildCasesForFixture(f.id).catch(() => [])
    all.push(...cs)
    if (all.length >= maxCases()) break
  }
  run.fixtureIds = live.slice(0, cap).map((f: any) => f.id)
  return persistAndLearn(run, all)
}

export async function rebuildCausalLearningCases(scope: 'today' | string): Promise<CausalLearningRun> {
  return scope === 'today' ? runCausalLearningForToday() : runCausalLearningForFixture(scope)
}

export async function listCausalLearningRuns(limit = 50): Promise<CausalLearningRun[]> {
  try { return await createRepositories().intelligence.listCausalLearningRuns(limit) } catch { return [] }
}

// Re-export for the outcome-based runner used by routes.
export { buildCaseForOutcome }
