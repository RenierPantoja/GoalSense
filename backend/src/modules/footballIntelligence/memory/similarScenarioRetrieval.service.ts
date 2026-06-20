/**
 * Similar Scenario Retrieval (B45 / Bloco 2).
 * ─────────────────────────────────────────────────────────────────────────────
 * Finds past fixtures similar to the current one (same context features) — this is
 * RETRIEVAL, never prediction. similarityScore is a retrieval distance in [0,1], NOT
 * a probability of the outcome repeating. Few/old matches → low similarityQuality and
 * an explicit usefulness caveat. Observed outcomes are surfaced honestly (unknown /
 * not_evaluable kept as-is).
 */
import { createRepositories } from '../../../repositories/index.js'
import { env } from '../../../env.js'
import { evaluateSampleQuality } from './memorySampleQuality.service.js'
import type { SimilarMatchScenario, SimilarScenarioResult, SampleQuality, MemoryOrigin } from './fundamentalMemory.types.js'

function norm(s: string): string { return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim() }
function recencyDays(): number { return Number(env.HISTORICAL_MEMORY_RECENCY_DAYS ?? 730) }

interface Features { isKnockout: boolean; importance: string; minuteBucket: string; volatility: string; competition: string }

function featuresOf(e: any): Features {
  const minute = Number(e?.minute ?? e?.matchContext?.minute ?? -1)
  return {
    isKnockout: e?.matchContext?.isKnockout === true,
    importance: e?.matchContext?.importanceLevel || 'unknown',
    minuteBucket: minute < 0 ? 'unknown' : minute < 45 ? 'first_half' : minute < 75 ? 'second_half' : 'late',
    volatility: e?.matchContext?.volatilityRisk || 'unknown',
    competition: norm(e?.leagueName || ''),
  }
}

function similarity(a: Features, b: Features): { score: number; matchedOn: string[] } {
  const matchedOn: string[] = []
  let score = 0, weight = 0
  const add = (cond: boolean, w: number, label: string) => { weight += w; if (cond) { score += w; matchedOn.push(label) } }
  add(a.isKnockout === b.isKnockout, 1, 'mata-mata')
  add(a.importance === b.importance && a.importance !== 'unknown', 1.5, 'importância')
  add(a.minuteBucket === b.minuteBucket && a.minuteBucket !== 'unknown', 1, 'janela de minuto')
  add(a.volatility === b.volatility && a.volatility !== 'unknown', 0.75, 'volatilidade')
  add(a.competition === b.competition && !!a.competition, 1, 'competição')
  return { score: weight > 0 ? score / weight : 0, matchedOn }
}

function outcomeOf(o: any): SimilarMatchScenario['observedOutcome'] {
  switch (o?.result) {
    case 'confirmed': return 'confirmed'
    case 'confirmed_partial': return 'confirmed_partial'
    case 'failed': return 'failed'
    case 'unknown': case 'expired': return 'unknown'
    default: return 'not_evaluable'
  }
}

function simQuality(score: number, sample: number): SampleQuality {
  const q = evaluateSampleQuality({ sampleSize: sample }).quality
  if (q === 'insufficient') return 'insufficient'
  if (score >= 0.8 && sample >= 4) return 'usable'
  if (score >= 0.6) return 'weak'
  return 'weak'
}

async function findSimilar(fixtureId: string, phaseFilter?: (e: any) => boolean): Promise<SimilarScenarioResult> {
  const repos = createRepositories()
  const fixture = await repos.fixtures.findById(fixtureId).catch(() => null)
  const baseLimitations = ['Recuperação de cenários similares ≠ previsão; similaridade é distância, não probabilidade de resultado.']
  if (!fixture) {
    return { fixtureId, scenarios: [], totalConsidered: 0, usableScenarios: 0, note: 'Fixture não encontrada.', limitations: baseLimitations, source: 'goalsense_internal_memory' }
  }

  let ledger: any[] = []
  let outcomes: any[] = []
  try { ledger = await repos.intelligence.listAllSignalLedgerEntries(3000) } catch { /* noop */ }
  try { outcomes = await repos.intelligence.listAllAlertOutcomes(3000) } catch { /* noop */ }
  const ledgerByAlert = new Map<string, any>()
  for (const e of ledger) if (e.alertId) ledgerByAlert.set(e.alertId, e)

  // Build a reference feature vector from current fixture's known context.
  const ref: Features = {
    isKnockout: false, importance: 'unknown',
    minuteBucket: 'unknown', volatility: 'unknown', competition: norm(fixture.competition || fixture.leagueName || ''),
  }

  const now = Date.now()
  const windowMs = recencyDays() * 86400000
  const scenarios: SimilarMatchScenario[] = []
  const seen = new Set<string>()
  let considered = 0
  for (const o of outcomes) {
    const e = o.alertId ? ledgerByAlert.get(o.alertId) : null
    if (!e || e.fixtureId === fixtureId) continue
    if (phaseFilter && !phaseFilter(e)) continue
    if (seen.has(e.fixtureId)) continue
    seen.add(e.fixtureId)
    considered++
    const f = featuresOf(e)
    const { score, matchedOn } = similarity(ref, f)
    if (score < 0.5) continue
    const t = new Date(o.resolvedAt || o.createdAt || e.createdAt).getTime()
    const recent = Number.isFinite(t) && (now - t) <= windowMs
    scenarios.push({
      fixtureId: e.fixtureId,
      matchedOn,
      similarityScore: Number(score.toFixed(3)),
      similarityQuality: simQuality(score, matchedOn.length),
      observedOutcome: outcomeOf(o),
      contextSummary: `${e.homeTeam || '?'} x ${e.awayTeam || '?'} (${e.leagueName || 'comp?'})${recent ? '' : ' [antigo]'}`,
      usefulnessNote: recent ? 'Cenário recente — apoio observacional.' : 'Cenário antigo — peso menor.',
      limitations: recent ? [] : ['Cenário fora da janela de recência (outdated).'],
    })
  }
  scenarios.sort((a, b) => b.similarityScore - a.similarityScore)
  const usable = scenarios.filter(s => s.similarityQuality === 'usable').length
  return {
    fixtureId, scenarios: scenarios.slice(0, 20), totalConsidered: considered, usableScenarios: usable,
    note: scenarios.length === 0 ? 'Sem cenários similares suficientes (insufficient_history).' : 'Cenários similares recuperados como apoio observacional.',
    limitations: baseLimitations, source: 'goalsense_internal_memory' as MemoryOrigin,
  }
}

export async function findSimilarPreMatchScenarios(fixtureId: string): Promise<SimilarScenarioResult> {
  return findSimilar(fixtureId)
}

export async function findSimilarLiveScenarios(fixtureId: string): Promise<SimilarScenarioResult> {
  return findSimilar(fixtureId, e => Number(e?.minute ?? e?.matchContext?.minute ?? -1) >= 0)
}

export function rankScenariosByUsefulness(result: SimilarScenarioResult): SimilarMatchScenario[] {
  const order: Record<SampleQuality, number> = { strong: 0, usable: 1, weak: 2, misleading_risk: 3, insufficient: 4, unknown: 5 }
  return [...result.scenarios].sort((a, b) => (order[a.similarityQuality] - order[b.similarityQuality]) || (b.similarityScore - a.similarityScore))
}

export function explainScenarioSimilarity(scenario: SimilarMatchScenario): string {
  return `Similaridade ${scenario.similarityScore} (${scenario.matchedOn.join(', ') || 'pouca correspondência'}) — resultado observado: ${scenario.observedOutcome}. ${scenario.usefulnessNote} (não é previsão).`
}
