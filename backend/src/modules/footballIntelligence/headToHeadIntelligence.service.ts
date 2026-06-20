/**
 * Head-to-Head Intelligence (Match Intelligence Fabric).
 * ─────────────────────────────────────────────────────────────────────────────
 * Analyzes direct confrontation WITHOUT superstition. Uses only what we have:
 * the GoalSense's internal record of prior fixtures between the two clubs (signal
 * ledger). No external H2H provider. Old/low-sample H2H is down-weighted; absence
 * is `insufficient_data`, never a "tabu". `inferred` never pretends to be fact.
 */
import { createRepositories } from '../../repositories/index.js'
import type { CanonicalHeadToHead, CanonicalMeta } from './footballIntelligence.types.js'

function norm(s: string): string { return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim() }
const RELEVANCE_WINDOW_DAYS = 540 // ~18 months

export interface HeadToHeadIntelligence {
  homeTeam: string
  awayTeam: string
  matchesFound: number
  relevantMatches: number
  outdatedMatches: number
  recurringPatterns: string[]
  brokenPatterns: string[]
  h2hReliability: 'high' | 'medium' | 'low' | 'insufficient_data'
  warnings: string[]
  limitations: string[]
  canonical: CanonicalHeadToHead
}

export async function buildHeadToHead(homeTeam: string, awayTeam: string): Promise<HeadToHeadIntelligence> {
  const repos = createRepositories()
  const h = norm(homeTeam), a = norm(awayTeam)
  const limitations: string[] = ['H2H derivado apenas da memória interna do GoalSense (sem provider de confronto direto).']
  const warnings: string[] = []

  let ledger: any[] = []
  try { ledger = await repos.intelligence.listAllSignalLedgerEntries(3000) } catch { /* noop */ }

  const pairs = ledger.filter(e => {
    const eh = norm(e.homeTeam), ea = norm(e.awayTeam)
    return (eh === h && ea === a) || (eh === a && ea === h)
  })
  const byFixture = new Map<string, any>()
  for (const e of pairs) if (!byFixture.has(e.fixtureId)) byFixture.set(e.fixtureId, e)
  const matches = [...byFixture.values()]

  const now = Date.now()
  let relevant = 0, outdated = 0
  for (const m of matches) {
    const t = m.createdAt ? new Date(m.createdAt).getTime() : null
    if (t && (now - t) / 86400000 <= RELEVANCE_WINDOW_DAYS) relevant++
    else outdated++
  }

  const reliability: HeadToHeadIntelligence['h2hReliability'] =
    relevant >= 5 ? 'medium' : relevant >= 2 ? 'low' : 'insufficient_data'

  if (matches.length === 0) limitations.push('Nenhum confronto direto na memória interna — insufficient_data (não é tabu).')
  if (outdated > 0) warnings.push(`${outdated} confronto(s) antigo(s) (> ${Math.round(RELEVANCE_WINDOW_DAYS / 30)} meses) têm peso menor.`)
  if (reliability === 'insufficient_data' && matches.length > 0) warnings.push('Amostra de H2H insuficiente para conclusões.')

  const meta: CanonicalMeta = {
    provider: 'goalsense_internal_memory', providerIds: {}, fetchedAt: new Date().toISOString(),
    dataQuality: matches.length > 0 ? 'partial' : 'unavailable', availability: matches.length > 0 ? 'partially_available' : 'unavailable',
    reliability: reliability === 'insufficient_data' ? 'unknown' : reliability, confidenceOfData: reliability === 'medium' ? 'medium' : 'low',
    source: 'internal_ledger_h2h', limitations,
  }

  return {
    homeTeam, awayTeam,
    matchesFound: matches.length, relevantMatches: relevant, outdatedMatches: outdated,
    recurringPatterns: [], brokenPatterns: [],
    h2hReliability: reliability, warnings, limitations,
    canonical: { matchesFound: matches.length, relevantMatches: relevant, outdatedMatches: outdated, recurringPatterns: [], meta },
  }
}
