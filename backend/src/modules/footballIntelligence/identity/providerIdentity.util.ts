/**
 * Cross-Provider Identity — PURE matching helpers (B42).
 * ─────────────────────────────────────────────────────────────────────────────
 * Env-free, dependency-light (node:crypto only) normalization + scoring. Name-only
 * never yields high confidence; swapped home/away and large kickoff deltas cap the
 * band; competition conflict prevents auto-confirm. Fully unit-testable without a
 * provider.
 */
import { createHash } from 'node:crypto'
import type { ConfidenceBand } from './providerIdentity.types.js'

const TEAM_NOISE = new Set(['fc', 'cf', 'sc', 'ec', 'afc', 'cd', 'ac', 'club', 'futbol', 'football', 'clube', 'sociedade', 'esporte', 'esportivo', 'de', 'do', 'da', 'the', 'team'])
const COMP_NOISE = new Set(['liga', 'league', 'serie', 'série', 'division', 'divisao', 'divisão', 'campeonato', 'cup', 'copa', 'taca', 'taça', 'primeira', 'segunda'])

export function stripDiacritics(s: string): string {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export function normalizeTeamName(name: string): string {
  const base = stripDiacritics(name || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
  const tokens = base.split(/\s+/).filter(t => t && !TEAM_NOISE.has(t))
  return tokens.join(' ').trim() || base.trim()
}

export function normalizeCompetitionName(name: string): string {
  const base = stripDiacritics(name || '').toLowerCase().replace(/\b(19|20)\d{2}\b/g, ' ').replace(/[^a-z0-9\s]/g, ' ')
  const tokens = base.split(/\s+/).filter(t => t && !COMP_NOISE.has(t))
  return tokens.join(' ').trim() || base.trim()
}

export function normalizeCountryName(name: string): string {
  return stripDiacritics(name || '').toLowerCase().replace(/[^a-z]/g, '').trim()
}

export function normalizeKickoffTime(date: string | Date | null | undefined): number | null {
  if (!date) return null
  const t = date instanceof Date ? date.getTime() : new Date(date).getTime()
  return Number.isFinite(t) ? t : null
}

/** Dice coefficient over token sets — 0..1. */
function tokenSimilarity(a: string, b: string): number {
  const ta = new Set(a.split(/\s+/).filter(Boolean))
  const tb = new Set(b.split(/\s+/).filter(Boolean))
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  return (2 * inter) / (ta.size + tb.size)
}

export function compareTeamNames(a: string, b: string): number {
  const na = normalizeTeamName(a), nb = normalizeTeamName(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  // substring containment bonus for short-vs-long official names.
  const contain = (na.length >= 4 && nb.includes(na)) || (nb.length >= 4 && na.includes(nb))
  return Math.max(tokenSimilarity(na, nb), contain ? 0.85 : 0)
}

export function compareCompetitionNames(a: string, b: string): number {
  const na = normalizeCompetitionName(a), nb = normalizeCompetitionName(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  return tokenSimilarity(na, nb)
}

export function calculateKickoffDelta(a: string | Date | null, b: string | Date | null): number | null {
  const ta = normalizeKickoffTime(a), tb = normalizeKickoffTime(b)
  if (ta == null || tb == null) return null
  return Math.round(Math.abs(ta - tb) / 60000)
}

export function buildFixtureIdentityFingerprint(input: { primaryProvider: string; primaryFixtureId: string; secondaryProvider: string; secondaryProviderFixtureId: string }): string {
  const h = createHash('sha1').update([input.primaryProvider, input.primaryFixtureId, input.secondaryProvider, input.secondaryProviderFixtureId].join('|')).digest('hex').slice(0, 16)
  return `fid_${h}`
}

export interface FixtureSide {
  home: string
  away: string
  competition: string
  country?: string | null
  kickoff: string | Date | null
}

export function detectSwappedHomeAway(primary: FixtureSide, secondary: FixtureSide): boolean {
  const directHome = compareTeamNames(primary.home, secondary.home)
  const directAway = compareTeamNames(primary.away, secondary.away)
  const swapHome = compareTeamNames(primary.home, secondary.away)
  const swapAway = compareTeamNames(primary.away, secondary.home)
  return (swapHome + swapAway) > (directHome + directAway) && (swapHome + swapAway) >= 1.4
}

export interface CandidateScore {
  score: number
  sameDate: boolean
  sameHomeAway: boolean
  swappedHomeAway: boolean
  competitionMatch: boolean
  countryMatch: boolean | 'unknown'
  kickoffDeltaMinutes: number | null
  homeSim: number
  awaySim: number
  compSim: number
  reasons: string[]
  warnings: string[]
}

function sameDay(a: string | Date | null, b: string | Date | null): boolean {
  const ta = normalizeKickoffTime(a), tb = normalizeKickoffTime(b)
  if (ta == null || tb == null) return false
  const da = new Date(ta), db = new Date(tb)
  return da.getUTCFullYear() === db.getUTCFullYear() && da.getUTCMonth() === db.getUTCMonth() && da.getUTCDate() === db.getUTCDate()
}

export function scoreFixtureCandidate(primary: FixtureSide, secondary: FixtureSide): CandidateScore {
  const reasons: string[] = []
  const warnings: string[] = []
  const homeSim = compareTeamNames(primary.home, secondary.home)
  const awaySim = compareTeamNames(primary.away, secondary.away)
  const swapped = detectSwappedHomeAway(primary, secondary)
  const compSim = compareCompetitionNames(primary.competition, secondary.competition)
  const sameDate = sameDay(primary.kickoff, secondary.kickoff)
  const kickoffDeltaMinutes = calculateKickoffDelta(primary.kickoff, secondary.kickoff)
  const countryMatch: boolean | 'unknown' = (primary.country && secondary.country) ? normalizeCountryName(primary.country) === normalizeCountryName(secondary.country) : 'unknown'

  // Weighted score (0..1). Teams dominate; date/kickoff/competition modulate.
  let score = 0
  const teamScore = (homeSim + awaySim) / 2
  score += teamScore * 0.5
  if (homeSim >= 0.8) reasons.push('mandante compatível')
  if (awaySim >= 0.8) reasons.push('visitante compatível')

  if (sameDate) { score += 0.2; reasons.push('mesma data') } else { warnings.push('datas diferentes'); score -= 0.15 }

  if (kickoffDeltaMinutes != null) {
    if (kickoffDeltaMinutes <= 20) { score += 0.15; reasons.push('horário muito próximo') }
    else if (kickoffDeltaMinutes <= 120) { score += 0.07; reasons.push('horário próximo') }
    else if (kickoffDeltaMinutes > 180) { warnings.push(`horário diverge ${kickoffDeltaMinutes}min`); score -= 0.1 }
  } else { warnings.push('horário indisponível para comparar') }

  const competitionMatch = compSim >= 0.6
  if (competitionMatch) { score += 0.12; reasons.push('competição compatível') }
  else if (compSim > 0) { warnings.push('competição apenas parecida') }
  else { warnings.push('competição não comparável') }

  if (countryMatch === true) { score += 0.05; reasons.push('país compatível') }

  if (swapped) warnings.push('mandante/visitante possivelmente invertidos')

  score = Math.max(0, Math.min(1, score))
  return { score, sameDate, sameHomeAway: !swapped && homeSim >= 0.6 && awaySim >= 0.6, swappedHomeAway: swapped, competitionMatch, countryMatch, kickoffDeltaMinutes, homeSim, awaySim, compSim, reasons, warnings }
}

export interface ClassifyOptions {
  highThreshold: number
  mediumThreshold: number
  maxKickoffDeltaMinutes: number
  requireCompetitionMatch: boolean
}

/** Classify a score into a band, applying safety caps. Name-only never reaches high. */
export function classifyCandidateScore(c: CandidateScore, opts: ClassifyOptions): ConfidenceBand {
  // Hard blockers for high confidence.
  const nameOnly = !c.sameDate && (c.kickoffDeltaMinutes == null)
  if (nameOnly) return c.score >= opts.mediumThreshold ? 'low' : 'unknown'
  let band: ConfidenceBand = c.score >= opts.highThreshold ? 'high' : c.score >= opts.mediumThreshold ? 'medium' : c.score > 0 ? 'low' : 'unknown'
  if (band === 'high') {
    if (!c.sameDate) band = 'medium'
    if (c.swappedHomeAway) band = 'medium'
    if (c.kickoffDeltaMinutes != null && c.kickoffDeltaMinutes > opts.maxKickoffDeltaMinutes) band = 'medium'
    if (opts.requireCompetitionMatch && !c.competitionMatch) band = 'medium'
  }
  return band
}

export function explainCandidate(c: CandidateScore, band: ConfidenceBand): string {
  return `score ${c.score.toFixed(2)} (${band}); ${c.reasons.join(', ') || 'sem reforços'}${c.warnings.length ? ` | avisos: ${c.warnings.join(', ')}` : ''}`
}
