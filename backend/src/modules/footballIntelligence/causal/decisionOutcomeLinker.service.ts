/**
 * Decision-Outcome Linker (B48 / Bloco 5).
 * ─────────────────────────────────────────────────────────────────────────────
 * Builds the strongest honest link between a governance decision, an alert and an
 * outcome — reducing PostMatch V6's "latest decision per fixture" heuristic. Link
 * strength is explicit: `exact` ONLY when ids match; temporal/contextual never
 * pretends to be exact; multiple close decisions → `ambiguous`; no link → unknown.
 */
import { createRepositories } from '../../../repositories/index.js'
import type { DecisionOutcomeLink, DecisionLinkStrength } from './causalLearning.types.js'

let seq = 0
function linkId(fixtureId: string, alertId: string | null, grId: string | null): string {
  return `dol_${fixtureId}__${alertId ?? 'noalert'}__${grId ?? 'nogr'}`
}

/** PURE: classify link strength from the matched ids/timing. */
export function classifyLinkStrength(input: {
  governanceCandidateAlertId?: string | null
  alertId?: string | null
  samePattern: boolean
  sameFixture: boolean
  closeInTimeMs?: number | null
  multipleCandidates?: boolean
}): { strength: DecisionLinkStrength; reasons: string[]; ambiguous: boolean } {
  const reasons: string[] = []
  const ambiguous = !!input.multipleCandidates
  if (input.governanceCandidateAlertId && input.alertId && input.governanceCandidateAlertId === input.alertId) {
    reasons.push('candidateAlertId === alertId (exato).')
    return { strength: 'exact', reasons, ambiguous: false }
  }
  if (!input.sameFixture) {
    reasons.push('Sem fixture em comum — sem vínculo.')
    return { strength: 'unknown', reasons, ambiguous }
  }
  if (input.samePattern && (input.closeInTimeMs ?? Infinity) <= 90 * 60000) {
    reasons.push('Mesma fixture+pattern e próximo no tempo.')
    return { strength: ambiguous ? 'temporal_contextual' : 'strong_contextual', reasons, ambiguous }
  }
  if (input.samePattern) {
    reasons.push('Mesma fixture+pattern (tempo distante).')
    return { strength: 'temporal_contextual', reasons, ambiguous }
  }
  reasons.push('Mesma fixture, sem pattern em comum — vínculo fraco.')
  return { strength: 'weak_contextual', reasons, ambiguous }
}

export function explainLinkStrength(link: DecisionOutcomeLink): string {
  return `${link.linkStrength}${link.ambiguous ? ' (ambíguo)' : ''} — ${link.linkReasons.join(' ') || 'sem motivos'}`
}

export async function findBestGovernanceResultForAlert(alertId: string, fixtureId: string, patternId: string | null): Promise<{ result: any | null; strength: DecisionLinkStrength; reasons: string[]; ambiguous: boolean }> {
  const repos = createRepositories()
  let candidates: any[] = []
  try { candidates = await repos.intelligence.listGovernanceResultsByCandidate(alertId, 10) } catch { /* noop */ }
  if (candidates.length > 0) {
    return { result: candidates[0], strength: 'exact', reasons: ['candidateAlertId bate com alertId.'], ambiguous: candidates.length > 1 }
  }
  // Fall back to fixture-level results, prefer same pattern.
  let byFixture: any[] = []
  try { byFixture = await repos.intelligence.listGovernanceResultsByFixture(fixtureId, 50) } catch { /* noop */ }
  const samePattern = byFixture.filter(r => r.patternId && r.patternId === patternId)
  const pool = samePattern.length > 0 ? samePattern : byFixture
  if (pool.length === 0) return { result: null, strength: 'unknown', reasons: ['Nenhuma decisão de governança para a fixture.'], ambiguous: false }
  const cls = classifyLinkStrength({ alertId, samePattern: samePattern.length > 0, sameFixture: true, multipleCandidates: pool.length > 1 })
  return { result: pool[0], strength: cls.strength, reasons: cls.reasons, ambiguous: cls.ambiguous }
}

export async function createDecisionOutcomeLink(input: {
  fixtureId: string; patternId: string | null; governanceResultId: string | null
  alertId: string | null; outcomeId: string | null; signalLedgerId: string | null; opportunityId: string | null
  strength: DecisionLinkStrength; reasons: string[]; ambiguous: boolean; limitations?: string[]
}): Promise<DecisionOutcomeLink> {
  seq = (seq + 1) % 1e9
  const link: DecisionOutcomeLink = {
    id: linkId(input.fixtureId, input.alertId, input.governanceResultId),
    fixtureId: input.fixtureId, patternId: input.patternId, governanceResultId: input.governanceResultId,
    alertId: input.alertId, outcomeId: input.outcomeId, signalLedgerId: input.signalLedgerId, opportunityId: input.opportunityId,
    linkStrength: input.strength, linkReasons: input.reasons, ambiguous: input.ambiguous,
    limitations: input.limitations ?? ['Vínculo contextual não é prova de causalidade.'], createdAt: new Date().toISOString(),
  }
  try { await createRepositories().intelligence.saveDecisionOutcomeLink(link) } catch { /* noop */ }
  return link
}
