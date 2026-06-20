/**
 * Matchup Fundamental Memory (B45 / Bloco 2).
 * ─────────────────────────────────────────────────────────────────────────────
 * Deep memory for a specific confrontation, built on B39 buildHeadToHead (internal
 * ledger only — no external H2H provider). Insufficient confrontations stay
 * `insufficient_data` and NEVER become a tabu; old confrontations are `outdated`.
 * reliability/maturity = data-confidence, not a probability of winning.
 */
import { createRepositories } from '../../../repositories/index.js'
import { buildHeadToHead } from '../headToHeadIntelligence.service.js'
import { evaluateH2HSampleQuality } from './memorySampleQuality.service.js'
import type { MatchupFundamentalMemoryProfile, MemoryProvenance } from './fundamentalMemory.types.js'

function norm(s: string): string { return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim() }

export async function buildMatchupMemory(homeTeamId: string, awayTeamId: string): Promise<MatchupFundamentalMemoryProfile> {
  const h2h = await buildHeadToHead(homeTeamId, awayTeamId).catch(() => null)
  const matchesFound = h2h?.matchesFound ?? 0
  const relevantMatches = h2h?.relevantMatches ?? 0
  const outdatedMatches = h2h?.outdatedMatches ?? 0

  const sample = evaluateH2HSampleQuality({ matchesFound, relevantMatches, outdatedMatches })

  let maturity: MatchupFundamentalMemoryProfile['maturity']
  let matchupState: MatchupFundamentalMemoryProfile['matchupState']
  if (matchesFound === 0) { maturity = 'insufficient_data'; matchupState = 'insufficient_data' }
  else if (sample.quality === 'strong') { maturity = 'high'; matchupState = 'mature' }
  else if (sample.quality === 'usable') { maturity = 'medium'; matchupState = 'usable' }
  else { maturity = sample.sampleSize > 0 ? 'low' : 'insufficient_data'; matchupState = 'developing' }

  const provenance: MemoryProvenance = {
    origin: 'goalsense_internal_memory',
    internalSampleSize: matchesFound,
    providerSampleSize: 0,
    manualSampleSize: 0,
    note: 'H2H derivado da memória interna do GoalSense (sem provider de confronto direto).',
  }

  const limitations = [
    'Memória de confronto observacional; insufficient_data nunca é tabu.',
    ...(h2h?.limitations ?? []),
  ]

  return {
    id: `mfm_${norm(homeTeamId).replace(/\s+/g, '_')}__${norm(awayTeamId).replace(/\s+/g, '_')}`,
    homeTeamId, awayTeamId,
    homeTeamName: h2h?.homeTeam || homeTeamId,
    awayTeamName: h2h?.awayTeam || awayTeamId,
    builtAt: new Date().toISOString(),
    matchesFound, relevantMatches, outdatedMatches,
    provenance, sample,
    recurringObservations: h2h?.recurringPatterns ?? [],
    brokenObservations: h2h?.brokenPatterns ?? [],
    matchupState, maturity,
    limitations: [...new Set(limitations)],
    source: 'goalsense_internal_memory',
  }
}

export async function buildMatchupMemoryForFixture(fixtureId: string): Promise<MatchupFundamentalMemoryProfile | null> {
  const repos = createRepositories()
  const fixture = await repos.fixtures.findById(fixtureId).catch(() => null)
  if (!fixture) return null
  return buildMatchupMemory(fixture.homeName || '', fixture.awayName || '')
}

export async function explainMatchupMemory(homeTeamId: string, awayTeamId: string): Promise<string> {
  const m = await buildMatchupMemory(homeTeamId, awayTeamId)
  if (m.matchesFound === 0) return `Sem confronto direto interno entre ${homeTeamId} e ${awayTeamId} (insufficient_data — não é tabu).`
  return `${m.homeTeamName} x ${m.awayTeamName}: ${m.matchesFound} confronto(s) (${m.relevantMatches} relevantes); maturidade ${m.maturity}.`
}
