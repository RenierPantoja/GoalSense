/**
 * Historical Memory Build Runner (B45 / Bloco 2).
 * ─────────────────────────────────────────────────────────────────────────────
 * Manual-first orchestration that builds and persists fundamental memory profiles
 * (team / matchup / pattern-context / taboos / similar scenarios). Scheduler is OFF
 * by default (ENABLE_HISTORICAL_MEMORY_SCHEDULER=false); builds are non-fatal and
 * never touch alert results/scores/counters. Persists only under Firebase; under
 * Noop the saves are accepted but not stored (reads stay insufficient_history).
 */
import { createRepositories } from '../../../repositories/index.js'
import { env } from '../../../env.js'
import { buildTeamFundamentalMemory } from './teamFundamentalMemory.service.js'
import { buildMatchupMemory, buildMatchupMemoryForFixture } from './matchupFundamentalMemory.service.js'
import { buildPatternContextProfile, getPatternMemoryForFixture } from './contextualPatternMemory.service.js'
import { detectTabooCandidates, detectTabooCandidatesForFixture } from './tabooIntelligence.service.js'
import { findSimilarPreMatchScenarios } from './similarScenarioRetrieval.service.js'
import type { MemoryBuildRun } from './fundamentalMemory.types.js'

function buildEnabled(): boolean { return String(env.ENABLE_HISTORICAL_MEMORY_BUILD).toLowerCase() === 'true' }
export function isHistoricalMemoryBuildEnabled(): boolean { return buildEnabled() }
export function isHistoricalMemorySchedulerEnabled(): boolean { return String(env.ENABLE_HISTORICAL_MEMORY_SCHEDULER).toLowerCase() === 'true' }
function maxFixtures(): number { return Number(env.HISTORICAL_MEMORY_MAX_FIXTURES_PER_RUN ?? 20) }

let seq = 0
function newRun(scope: MemoryBuildRun['scope'], targetKey: string | null): MemoryBuildRun {
  seq = (seq + 1) % 1e9
  return {
    id: `mbr_${Date.now().toString(36)}_${seq.toString(36)}`,
    scope, targetKey, status: 'running', startedAt: new Date().toISOString(), finishedAt: null,
    teamsBuilt: 0, matchupsBuilt: 0, patternContextsBuilt: 0, taboosEvaluated: 0, notes: [], error: null,
  }
}

async function persistRun(run: MemoryBuildRun): Promise<void> {
  const repos = createRepositories()
  try { await repos.intelligence.createMemoryBuildRun(run) } catch { /* noop */ }
}
async function finishRun(run: MemoryBuildRun, patch: Partial<MemoryBuildRun>): Promise<MemoryBuildRun> {
  const repos = createRepositories()
  const finished: MemoryBuildRun = { ...run, ...patch, status: patch.status || 'completed', finishedAt: new Date().toISOString() }
  try { await repos.intelligence.updateMemoryBuildRun(run.id, finished) } catch { /* noop */ }
  return finished
}

function disabledRun(scope: MemoryBuildRun['scope'], targetKey: string | null): MemoryBuildRun {
  const r = newRun(scope, targetKey)
  return { ...r, status: 'skipped', finishedAt: new Date().toISOString(), notes: ['ENABLE_HISTORICAL_MEMORY_BUILD=false — build desligado (sem efeito).'] }
}

export async function buildMemoryForTeam(teamId: string): Promise<MemoryBuildRun> {
  if (!buildEnabled()) return disabledRun('team', teamId)
  const run = newRun('team', teamId); await persistRun(run)
  const repos = createRepositories()
  try {
    const profile = await buildTeamFundamentalMemory(teamId)
    await repos.intelligence.saveTeamFundamentalMemory(profile).catch(() => null)
    return finishRun(run, { teamsBuilt: 1, notes: [`Memória do clube ${teamId} construída (${profile.memoryState}).`] })
  } catch (e: any) {
    return finishRun(run, { status: 'failed', error: e?.message || String(e) })
  }
}

export async function buildMemoryForMatchup(homeTeamId: string, awayTeamId: string): Promise<MemoryBuildRun> {
  if (!buildEnabled()) return disabledRun('matchup', `${homeTeamId}__${awayTeamId}`)
  const run = newRun('matchup', `${homeTeamId}__${awayTeamId}`); await persistRun(run)
  const repos = createRepositories()
  try {
    const profile = await buildMatchupMemory(homeTeamId, awayTeamId)
    await repos.intelligence.saveMatchupFundamentalMemory(profile).catch(() => null)
    return finishRun(run, { matchupsBuilt: 1, notes: [`Memória de confronto construída (${profile.matchupState}).`] })
  } catch (e: any) {
    return finishRun(run, { status: 'failed', error: e?.message || String(e) })
  }
}

export async function buildMemoryForFixture(fixtureId: string): Promise<MemoryBuildRun> {
  if (!buildEnabled()) return disabledRun('fixture', fixtureId)
  const run = newRun('fixture', fixtureId); await persistRun(run)
  const repos = createRepositories()
  try {
    const fixture = await repos.fixtures.findById(fixtureId).catch(() => null)
    if (!fixture) return finishRun(run, { status: 'failed', error: 'Fixture não encontrada.' })
    let teams = 0, matchups = 0, contexts = 0, taboos = 0
    for (const name of [fixture.homeName, fixture.awayName].filter(Boolean) as string[]) {
      const profile = await buildTeamFundamentalMemory(name).catch(() => null)
      if (profile) { await repos.intelligence.saveTeamFundamentalMemory(profile).catch(() => null); teams++ }
    }
    const matchup = await buildMatchupMemoryForFixture(fixtureId).catch(() => null)
    if (matchup) { await repos.intelligence.saveMatchupFundamentalMemory(matchup).catch(() => null); matchups++ }
    const pcs = await getPatternMemoryForFixture(fixtureId).catch(() => [])
    for (const p of pcs) { await repos.intelligence.saveHistoricalPatternContextProfile(p).catch(() => null); contexts++ }
    const tabooCands = await detectTabooCandidatesForFixture(fixtureId).catch(() => [])
    for (const t of tabooCands) { await repos.intelligence.saveTabooCandidate(t).catch(() => null); taboos++ }
    return finishRun(run, { teamsBuilt: teams, matchupsBuilt: matchups, patternContextsBuilt: contexts, taboosEvaluated: taboos, notes: ['Memória do jogo construída.'] })
  } catch (e: any) {
    return finishRun(run, { status: 'failed', error: e?.message || String(e) })
  }
}

export async function buildPatternMemoryForFixture(fixtureId: string): Promise<MemoryBuildRun> {
  if (!buildEnabled()) return disabledRun('pattern_context', fixtureId)
  const run = newRun('pattern_context', fixtureId); await persistRun(run)
  const repos = createRepositories()
  try {
    const pcs = await getPatternMemoryForFixture(fixtureId).catch(() => [])
    for (const p of pcs) await repos.intelligence.saveHistoricalPatternContextProfile(p).catch(() => null)
    return finishRun(run, { patternContextsBuilt: pcs.length, notes: [`${pcs.length} perfis padrão×contexto construídos.`] })
  } catch (e: any) {
    return finishRun(run, { status: 'failed', error: e?.message || String(e) })
  }
}

export async function buildTaboosForFixture(fixtureId: string): Promise<MemoryBuildRun> {
  if (!buildEnabled()) return disabledRun('taboos', fixtureId)
  const run = newRun('taboos', fixtureId); await persistRun(run)
  const repos = createRepositories()
  try {
    const cands = await detectTabooCandidatesForFixture(fixtureId).catch(() => [])
    for (const c of cands) await repos.intelligence.saveTabooCandidate(c).catch(() => null)
    return finishRun(run, { taboosEvaluated: cands.length, notes: [`${cands.length} candidatos a restrição avaliados (a maioria não usável).`] })
  } catch (e: any) {
    return finishRun(run, { status: 'failed', error: e?.message || String(e) })
  }
}

export async function buildSimilarScenariosForFixture(fixtureId: string): Promise<MemoryBuildRun> {
  if (!buildEnabled()) return disabledRun('similar_scenarios', fixtureId)
  const run = newRun('similar_scenarios', fixtureId); await persistRun(run)
  try {
    const res = await findSimilarPreMatchScenarios(fixtureId).catch(() => null)
    return finishRun(run, { notes: [`${res?.scenarios.length ?? 0} cenários similares recuperados (não é previsão).`] })
  } catch (e: any) {
    return finishRun(run, { status: 'failed', error: e?.message || String(e) })
  }
}

export async function buildMemoryForToday(): Promise<MemoryBuildRun> {
  if (!buildEnabled()) return disabledRun('today', null)
  const run = newRun('today', null); await persistRun(run)
  const repos = createRepositories()
  try {
    const cap = maxFixtures()
    let live: any[] = []
    try { live = await repos.fixtures.listLive(['NS', '1H', '2H', 'HT'], cap) } catch { /* noop */ }
    let teams = 0, matchups = 0
    const teamNames = new Set<string>()
    for (const f of live.slice(0, cap)) {
      if (f.homeName) teamNames.add(f.homeName)
      if (f.awayName) teamNames.add(f.awayName)
      const matchup = await buildMatchupMemoryForFixture(f.id).catch(() => null)
      if (matchup) { await repos.intelligence.saveMatchupFundamentalMemory(matchup).catch(() => null); matchups++ }
    }
    for (const t of teamNames) {
      const profile = await buildTeamFundamentalMemory(t).catch(() => null)
      if (profile) { await repos.intelligence.saveTeamFundamentalMemory(profile).catch(() => null); teams++ }
    }
    // Global pattern×context refresh.
    const pcs = await buildPatternContextProfile().catch(() => [])
    for (const p of pcs) await repos.intelligence.saveHistoricalPatternContextProfile(p).catch(() => null)
    return finishRun(run, { teamsBuilt: teams, matchupsBuilt: matchups, patternContextsBuilt: pcs.length, notes: [`Hoje: ${live.length} jogos considerados, ${teams} clubes, ${matchups} confrontos.`] })
  } catch (e: any) {
    return finishRun(run, { status: 'failed', error: e?.message || String(e) })
  }
}
