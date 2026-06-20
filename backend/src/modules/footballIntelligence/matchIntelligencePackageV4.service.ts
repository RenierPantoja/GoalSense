/**
 * Match Intelligence Package V4 (B45 / Bloco 2).
 * ─────────────────────────────────────────────────────────────────────────────
 * Composes V3 with the historical memory layer: team fundamental memory (home/away),
 * matchup memory, contextual pattern memory, taboo candidates and similar scenarios,
 * plus a memory-readiness summary. Read-only; builds memory on the fly (does NOT
 * fetch providers, does NOT persist). Advisory only — never changes score/confidence/
 * patterns/alert results.
 */
import { buildMatchIntelligencePackageV3, type MatchIntelligencePackageV3 } from './matchIntelligencePackageV3.service.js'
import { createRepositories } from '../../repositories/index.js'
import { buildTeamFundamentalMemory } from './memory/teamFundamentalMemory.service.js'
import { buildMatchupMemoryForFixture } from './memory/matchupFundamentalMemory.service.js'
import { getPatternMemoryForFixture } from './memory/contextualPatternMemory.service.js'
import { detectTabooCandidatesForFixture } from './memory/tabooIntelligence.service.js'
import { findSimilarPreMatchScenarios } from './memory/similarScenarioRetrieval.service.js'
import type {
  TeamFundamentalMemoryProfile, MatchupFundamentalMemoryProfile,
  HistoricalPatternContextProfile, TabooCandidate, SimilarScenarioResult,
} from './memory/fundamentalMemory.types.js'

export interface MatchIntelligencePackageV4 {
  base: MatchIntelligencePackageV3 | null
  homeMemory: TeamFundamentalMemoryProfile | null
  awayMemory: TeamFundamentalMemoryProfile | null
  matchupMemory: MatchupFundamentalMemoryProfile | null
  patternContextMemory: HistoricalPatternContextProfile[]
  taboos: TabooCandidate[]
  usableTaboos: TabooCandidate[]
  similarScenarios: SimilarScenarioResult | null
  memoryReadiness: 'mature' | 'usable' | 'developing' | 'insufficient_history'
  memorySupportFactors: string[]
  memoryCautionFactors: string[]
  limitations: string[]
}

export async function buildMatchIntelligencePackageV4(fixtureId: string): Promise<MatchIntelligencePackageV4 | null> {
  const repos = createRepositories()
  const fixture = await repos.fixtures.findById(fixtureId).catch(() => null)

  const [base, matchup, patternContext, taboos, similar] = await Promise.all([
    buildMatchIntelligencePackageV3(fixtureId).catch(() => null),
    buildMatchupMemoryForFixture(fixtureId).catch(() => null),
    getPatternMemoryForFixture(fixtureId).catch(() => [] as HistoricalPatternContextProfile[]),
    detectTabooCandidatesForFixture(fixtureId).catch(() => [] as TabooCandidate[]),
    findSimilarPreMatchScenarios(fixtureId).catch(() => null),
  ])

  const [homeMemory, awayMemory] = await Promise.all([
    fixture?.homeName ? buildTeamFundamentalMemory(fixture.homeName).catch(() => null) : Promise.resolve(null),
    fixture?.awayName ? buildTeamFundamentalMemory(fixture.awayName).catch(() => null) : Promise.resolve(null),
  ])

  if (!base && !fixture) return null

  const usableTaboos = taboos.filter(t => t.status === 'supported' && t.isUsableConstraint)

  const memorySupportFactors: string[] = []
  const memoryCautionFactors: string[] = []
  for (const [side, mem] of [['casa', homeMemory], ['fora', awayMemory]] as const) {
    if (!mem) continue
    if (mem.memoryState === 'insufficient_history') memoryCautionFactors.push(`Memória ${side}: insufficient_history.`)
    else if (mem.overallSample.quality === 'strong') memorySupportFactors.push(`Memória ${side} forte (apoio, não probabilidade).`)
    else if (mem.overallSample.quality === 'misleading_risk') memoryCautionFactors.push(`Memória ${side} potencialmente enganosa (antiga/contexto misto).`)
  }
  if (matchup && matchup.matchupState === 'insufficient_data') memoryCautionFactors.push('Confronto direto insuficiente (não é tabu).')
  for (const p of patternContext) {
    if (p.recommendation === 'stay_out') memoryCautionFactors.push(`Contexto "${p.contextLabel}" historicamente desfavorável a ${p.patternName}.`)
    else if (p.recommendation === 'use_with_confidence') memorySupportFactors.push(`Contexto "${p.contextLabel}" historicamente favorável a ${p.patternName}.`)
  }
  for (const t of usableTaboos) memoryCautionFactors.push(`Restrição histórica usável: ${t.description}`)

  // Memory readiness from team states (the weaker side dominates).
  const states = [homeMemory?.memoryState, awayMemory?.memoryState].filter(Boolean) as string[]
  let memoryReadiness: MatchIntelligencePackageV4['memoryReadiness']
  if (states.length === 0 || states.every(s => s === 'insufficient_history')) memoryReadiness = 'insufficient_history'
  else if (states.includes('insufficient_history') || states.includes('developing')) memoryReadiness = 'developing'
  else if (states.every(s => s === 'mature')) memoryReadiness = 'mature'
  else memoryReadiness = 'usable'

  return {
    base,
    homeMemory, awayMemory, matchupMemory: matchup,
    patternContextMemory: patternContext, taboos, usableTaboos, similarScenarios: similar,
    memoryReadiness, memorySupportFactors, memoryCautionFactors,
    limitations: ['Pacote V4: memória histórica como apoio observacional; não altera score/confiança/padrões; reliability ≠ probabilidade.'],
  }
}
