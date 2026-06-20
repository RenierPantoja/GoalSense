/**
 * Team Fundamental Memory (B45 / Bloco 2).
 * ─────────────────────────────────────────────────────────────────────────────
 * Builds a deep, honest memory profile per club from the GoalSense's OWN history
 * (reuses B39 buildTeamMemory + signal ledger + outcomes). Separates internalMemory
 * from providerMemory. Empty memory → `insufficient_history`; small samples never
 * become strong conclusions; old/different-context cases are down-weighted. No
 * provider is called here; no data is invented.
 */
import { createRepositories } from '../../../repositories/index.js'
import { env } from '../../../env.js'
import { buildTeamMemory } from '../teamMemoryEngine.service.js'
import {
  evaluateTeamMemoryQuality, evaluateSampleQuality, evaluatePatternContextQuality,
} from './memorySampleQuality.service.js'
import type {
  TeamFundamentalMemoryProfile, TeamHomeAwayProfile, GoalBehaviorProfile,
  CardBehaviorProfile, PatternHistoryProfile, ContextBehaviorProfile, MemoryProvenance,
  SampleQuality,
} from './fundamentalMemory.types.js'

function norm(s: string): string { return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim() }
function recencyDays(): number { return Number(env.HISTORICAL_MEMORY_RECENCY_DAYS ?? 730) }
function strongThreshold(): number { return Number(env.HISTORICAL_MEMORY_MIN_SAMPLE_FOR_STRONG ?? 8) }

function memoryState(sample: number): TeamFundamentalMemoryProfile['memoryState'] {
  if (sample === 0) return 'insufficient_history'
  if (sample < 4) return 'developing'
  if (sample < strongThreshold()) return 'usable'
  return 'mature'
}

/**
 * Build the fundamental memory for one club. `teamId` is the team name/key used across
 * the internal ledger (GoalSense keys teams by name).
 */
export async function buildTeamFundamentalMemory(teamId: string): Promise<TeamFundamentalMemoryProfile> {
  const repos = createRepositories()
  const target = norm(teamId)
  const windowDays = recencyDays()
  const strong = strongThreshold()
  const now = Date.now()

  // B39 internal team memory is the foundation.
  const base = await buildTeamMemory(teamId).catch(() => null)

  let ledger: any[] = []
  let outcomes: any[] = []
  try { ledger = await repos.intelligence.listAllSignalLedgerEntries(3000) } catch { /* noop */ }
  try { outcomes = await repos.intelligence.listAllAlertOutcomes(3000) } catch { /* noop */ }

  const teamLedger = ledger.filter(e => norm(e.homeTeam) === target || norm(e.awayTeam) === target)
  const alertIds = new Set(teamLedger.map(e => e.alertId).filter(Boolean))
  const fixtureIds = new Set(teamLedger.map(e => e.fixtureId))
  const ledgerByAlert = new Map<string, any>()
  for (const e of teamLedger) if (e.alertId) ledgerByAlert.set(e.alertId, e)
  const teamOutcomes = outcomes.filter(o => alertIds.has(o.alertId) || fixtureIds.has(o.fixtureId))

  // Recency split.
  const isRecent = (iso: string | undefined): boolean => {
    if (!iso) return false
    const t = new Date(iso).getTime()
    return Number.isFinite(t) && (now - t) / 86400000 <= windowDays
  }

  // ── Home/away split ──
  const ha: TeamHomeAwayProfile = buildHomeAway(teamLedger, teamOutcomes, ledgerByAlert, target, strong)

  // ── Overall sample quality ──
  const recentOutcomes = teamOutcomes.filter(o => isRecent(o.resolvedAt || o.createdAt))
  const competitions = [...new Set(teamLedger.map(e => e.leagueName).filter(Boolean))]
  const overallSample = evaluateTeamMemoryQuality({
    sampleSize: teamOutcomes.length,
    fixturesAnalyzed: fixtureIds.size,
    competitions: competitions.length,
  })
  // Refine with explicit recency split.
  if (teamOutcomes.length > 0) {
    const refined = evaluateSampleQuality({
      sampleSize: teamOutcomes.length,
      recentSampleSize: recentOutcomes.length,
      outdatedSampleSize: teamOutcomes.length - recentOutcomes.length,
      strongThreshold: strong,
    })
    overallSample.quality = refined.quality
    overallSample.reliability = refined.reliability
    overallSample.recentSampleSize = recentOutcomes.length
    overallSample.outdatedSampleSize = teamOutcomes.length - recentOutcomes.length
    overallSample.canConclude = refined.canConclude
    overallSample.warnings = [...new Set([...overallSample.warnings, ...refined.warnings])]
    overallSample.limitations = [...new Set([...overallSample.limitations, ...refined.limitations])]
  }

  // ── Goals / cards: observed only from explicit ledger context; never invented ──
  const goals = buildGoalBehavior(teamLedger, strong)
  const cards = buildCardBehavior(teamLedger, strong)

  // ── Pattern history per club ──
  const patternHistory = buildPatternHistory(teamLedger, teamOutcomes, ledgerByAlert, strong)

  // ── Context behaviors ──
  const contextBehaviors = buildContextBehaviors(teamLedger, teamOutcomes, ledgerByAlert, strong)

  const provenance: MemoryProvenance = {
    origin: 'goalsense_internal_memory',
    internalSampleSize: teamOutcomes.length,
    providerSampleSize: 0,
    manualSampleSize: 0,
    note: 'Memória interna do GoalSense (ledger + outcomes). providerMemory mantida separada.',
  }

  const limitations: string[] = [
    'Memória fundamental observacional; reliability = confiança do dado, não probabilidade de acerto.',
    ...(base?.limitations ?? []),
  ]
  if (teamOutcomes.length === 0) limitations.push('Sem histórico interno — insufficient_history (não é achado negativo).')

  return {
    id: `tfm_${target.replace(/\s+/g, '_')}`,
    teamId,
    teamName: base?.teamName || teamId,
    builtAt: new Date().toISOString(),
    recencyWindowDays: windowDays,
    provenance,
    overallSample,
    homeAway: ha,
    goals,
    cards,
    patternHistory,
    contextBehaviors,
    competitionsObserved: competitions,
    memoryState: memoryState(teamOutcomes.length),
    limitations: [...new Set(limitations)],
    source: 'goalsense_internal_memory',
  }
}

function outcomeResult(o: any): 'confirmed' | 'confirmed_partial' | 'failed' | 'unknown' | 'not_evaluable' {
  switch (o?.result) {
    case 'confirmed': return 'confirmed'
    case 'confirmed_partial': return 'confirmed_partial'
    case 'failed': return 'failed'
    case 'unknown': case 'expired': return 'unknown'
    default: return 'not_evaluable'
  }
}

function buildHomeAway(ledger: any[], outcomes: any[], ledgerByAlert: Map<string, any>, target: string, strong: number): TeamHomeAwayProfile {
  let homeSample = 0, awaySample = 0, hC = 0, hF = 0, aC = 0, aF = 0
  for (const o of outcomes) {
    const e = o.alertId ? ledgerByAlert.get(o.alertId) : null
    if (!e) continue
    const isHome = norm(e.homeTeam) === target
    const r = outcomeResult(o)
    if (isHome) { homeSample++; if (r === 'confirmed') hC++; else if (r === 'failed') hF++ }
    else { awaySample++; if (r === 'confirmed') aC++; else if (r === 'failed') aF++ }
  }
  const hq = evaluateSampleQuality({ sampleSize: homeSample, strongThreshold: strong }).quality
  const aq = evaluateSampleQuality({ sampleSize: awaySample, strongThreshold: strong }).quality
  return {
    homeSample, awaySample, homeConfirmed: hC, homeFailed: hF, awayConfirmed: aC, awayFailed: aF,
    homeQuality: hq, awayQuality: aq,
    note: homeSample + awaySample === 0 ? 'Sem split casa/fora — insufficient_history.' : 'Split casa/fora observacional; amostra pequena não conclui.',
  }
}

function buildGoalBehavior(ledger: any[], strong: number): GoalBehaviorProfile {
  // We only "observe" goal behavior if ledger entries carry goal-context fields.
  const withGoalCtx = ledger.filter(e => e?.matchContext?.goalsAtSignal !== undefined || e?.goalContext)
  const sample = withGoalCtx.length
  const q: SampleQuality = evaluateSampleQuality({ sampleSize: sample, strongThreshold: strong }).quality
  return {
    observed: sample > 0,
    sample,
    tendencyNote: sample === 0 ? 'Comportamento de gols não observado internamente (não inventar).' : 'Tendência de gols observada apenas como apoio.',
    quality: q,
    limitations: sample === 0 ? ['Ausência de contexto de gols ≠ "não faz gols".'] : [],
  }
}

function buildCardBehavior(ledger: any[], strong: number): CardBehaviorProfile {
  const withCardCtx = ledger.filter(e => e?.matchContext?.cardsAtSignal !== undefined || e?.cardContext)
  const sample = withCardCtx.length
  const q: SampleQuality = evaluateSampleQuality({ sampleSize: sample, strongThreshold: strong }).quality
  return {
    observed: sample > 0,
    sample,
    tendencyNote: sample === 0 ? 'Comportamento de cartões não observado internamente (não inventar).' : 'Tendência de cartões observada apenas como apoio.',
    quality: q,
    limitations: sample === 0 ? ['Ausência de contexto de cartões ≠ "não toma cartão".'] : [],
  }
}

function buildPatternHistory(ledger: any[], outcomes: any[], ledgerByAlert: Map<string, any>, strong: number): PatternHistoryProfile[] {
  const byPattern = new Map<string, { name: string; triggered: number; c: number; cp: number; f: number; u: number; ne: number }>()
  for (const e of ledger) {
    const key = e.patternId || e.patternKey || 'unknown'
    if (!byPattern.has(key)) byPattern.set(key, { name: e.patternName || key, triggered: 0, c: 0, cp: 0, f: 0, u: 0, ne: 0 })
    byPattern.get(key)!.triggered++
  }
  for (const o of outcomes) {
    const e = o.alertId ? ledgerByAlert.get(o.alertId) : null
    const key = e?.patternId || e?.patternKey || 'unknown'
    if (!byPattern.has(key)) byPattern.set(key, { name: e?.patternName || key, triggered: 0, c: 0, cp: 0, f: 0, u: 0, ne: 0 })
    const slot = byPattern.get(key)!
    const r = outcomeResult(o)
    if (r === 'confirmed') slot.c++
    else if (r === 'confirmed_partial') slot.cp++
    else if (r === 'failed') slot.f++
    else if (r === 'unknown') slot.u++
    else slot.ne++
  }
  const out: PatternHistoryProfile[] = []
  for (const [key, v] of byPattern) {
    const sample = evaluatePatternContextQuality({ confirmed: v.c, confirmedPartial: v.cp, failed: v.f, unknown: v.u, notEvaluable: v.ne })
    const evaluable = v.c + v.cp + v.f
    let status: PatternHistoryProfile['status']
    if (evaluable === 0) status = 'not_enough_data'
    else if (sample.quality === 'weak' || sample.quality === 'misleading_risk') status = 'weak_sample'
    else if (v.f > v.c + v.cp) status = 'contradicted'
    else if (v.c + v.cp > v.f && sample.quality === 'strong') status = 'supported'
    else status = 'mixed'
    out.push({
      patternKey: key, patternName: v.name, triggered: v.triggered,
      confirmed: v.c, confirmedPartial: v.cp, failed: v.f, unknown: v.u, notEvaluable: v.ne,
      quality: sample.quality, status,
      note: status === 'not_enough_data' ? 'Sem casos avaliáveis (unknown/not_evaluable ≠ falha).' : 'Histórico do padrão para o clube; amostra pequena não conclui.',
    })
  }
  return out.sort((a, b) => b.triggered - a.triggered).slice(0, 20)
}

function buildContextBehaviors(ledger: any[], outcomes: any[], ledgerByAlert: Map<string, any>, strong: number): ContextBehaviorProfile[] {
  // Context keys derived from ledger matchContext when present.
  const keys: Array<{ key: string; label: string; test: (e: any) => boolean }> = [
    { key: 'knockout', label: 'Mata-mata', test: e => e?.matchContext?.isKnockout === true },
    { key: 'high_importance', label: 'Alta importância', test: e => ['high', 'critical'].includes(e?.matchContext?.importanceLevel) },
    { key: 'late_game', label: 'Fim de jogo (75\'+)', test: e => Number(e?.minute ?? e?.matchContext?.minute ?? 0) >= 75 },
  ]
  const out: ContextBehaviorProfile[] = []
  for (const def of keys) {
    let sample = 0, c = 0, f = 0, u = 0
    for (const o of outcomes) {
      const e = o.alertId ? ledgerByAlert.get(o.alertId) : null
      if (!e || !def.test(e)) continue
      sample++
      const r = outcomeResult(o)
      if (r === 'confirmed') c++; else if (r === 'failed') f++; else if (r === 'unknown') u++
    }
    if (sample === 0) continue
    const q = evaluateSampleQuality({ sampleSize: sample, strongThreshold: strong })
    let classification: ContextBehaviorProfile['classification']
    if (q.quality === 'weak' || q.quality === 'insufficient') classification = 'not_enough_data'
    else if (q.quality === 'misleading_risk') classification = 'misleading_context'
    else if (f > c && q.quality === 'strong') classification = 'stay_out_context'
    else if (c > f && q.quality === 'strong') classification = 'strong_context'
    else classification = 'usable_context'
    out.push({
      contextKey: def.key, contextLabel: def.label, sample, confirmed: c, failed: f, unknown: u,
      quality: q.quality, classification,
      note: 'Comportamento por contexto observacional; amostra pequena não conclui.',
    })
  }
  return out
}

export async function buildTeamMemoryForTodayFixtures(maxFixtures?: number): Promise<TeamFundamentalMemoryProfile[]> {
  const repos = createRepositories()
  const cap = maxFixtures ?? Number(env.HISTORICAL_MEMORY_MAX_FIXTURES_PER_RUN ?? 20)
  let live: any[] = []
  try { live = await repos.fixtures.listLive(['NS', '1H', '2H', 'HT'], cap) } catch { /* noop */ }
  const teams = new Set<string>()
  for (const f of live) { if (f.homeName) teams.add(f.homeName); if (f.awayName) teams.add(f.awayName) }
  const out: TeamFundamentalMemoryProfile[] = []
  for (const t of [...teams].slice(0, cap * 2)) out.push(await buildTeamFundamentalMemory(t).catch(() => null) as any)
  return out.filter(Boolean)
}

export async function explainTeamFundamentalMemory(teamId: string): Promise<string> {
  const m = await buildTeamFundamentalMemory(teamId)
  if (m.overallSample.sampleSize === 0) return `Sem memória fundamental sobre ${teamId} (insufficient_history).`
  return `${m.teamName}: ${m.overallSample.sampleSize} casos (${m.overallSample.quality}); estado ${m.memoryState}. Confiança de dado, não probabilidade.`
}
