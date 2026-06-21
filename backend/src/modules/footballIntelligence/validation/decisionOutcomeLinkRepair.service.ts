/**
 * Decision-Outcome Link Repair / Backfill (B49 / Bloco 6).
 * ─────────────────────────────────────────────────────────────────────────────
 * Improves causal evaluability WITHOUT lying: never promotes a weak link to `exact`
 * (exact requires real matching ids). It may upgrade `temporal_contextual` →
 * `strong_contextual` only when same fixture + same pattern + compatible time window +
 * no competing candidate. Ambiguous stays ambiguous. Reports unresolved links.
 */
import { createRepositories } from '../../../repositories/index.js'
import { findBestGovernanceResultForAlert, createDecisionOutcomeLink } from '../causal/decisionOutcomeLinker.service.js'
import type { DecisionOutcomeLink } from '../causal/causalLearning.types.js'

export interface LinkRepairResult {
  fixtureId: string | null
  examined: number
  exactConfirmed: number
  upgraded: number
  unresolved: number
  ambiguous: number
  links: DecisionOutcomeLink[]
  limitations: string[]
}

export async function repairLinksForFixture(fixtureId: string): Promise<LinkRepairResult> {
  const repos = createRepositories()
  let alerts: any[] = []
  try { alerts = await repos.alerts.findByFixtureIds(fixtureId) } catch { /* noop */ }
  const links: DecisionOutcomeLink[] = []
  let exactConfirmed = 0, upgraded = 0, unresolved = 0, ambiguous = 0

  for (const a of alerts) {
    const outcome = await repos.intelligence.getAlertOutcomeByAlertId(a.id).catch(() => null)
    const best = await findBestGovernanceResultForAlert(a.id, fixtureId, a.patternId ?? null).catch(() => null)
    if (!best || !best.result) { unresolved++; continue }
    // NEVER promote to exact unless the id genuinely matches (linker already enforces this).
    let strength = best.strength
    if (strength === 'temporal_contextual' && best.result.patternId === (a.patternId ?? null) && !best.ambiguous) {
      strength = 'strong_contextual'
      upgraded++
    }
    if (best.ambiguous) ambiguous++
    if (strength === 'exact') exactConfirmed++
    const link = await createDecisionOutcomeLink({
      fixtureId, patternId: a.patternId ?? null, governanceResultId: best.result.id, alertId: a.id,
      outcomeId: outcome?.id ?? null, signalLedgerId: null, opportunityId: best.result.opportunityId ?? null,
      strength, reasons: best.reasons, ambiguous: best.ambiguous,
      limitations: ['Repair nunca promove weak/temporal para exact sem id real.'],
    }).catch(() => null)
    if (link) links.push(link)
  }

  return {
    fixtureId, examined: alerts.length, exactConfirmed, upgraded, unresolved, ambiguous, links,
    limitations: ['Vínculo contextual não é prova de causalidade; ambíguo permanece ambíguo.'],
  }
}

export async function repairLinksForToday(): Promise<LinkRepairResult> {
  const repos = createRepositories()
  let live: any[] = []
  try { live = await repos.fixtures.listLive(['FT', 'AET', 'PEN', '2H', 'HT'], 20) } catch { /* noop */ }
  const agg: LinkRepairResult = { fixtureId: null, examined: 0, exactConfirmed: 0, upgraded: 0, unresolved: 0, ambiguous: 0, links: [], limitations: ['Repair nunca promove weak para exact sem id real.'] }
  for (const f of live.slice(0, 20)) {
    const r = await repairLinksForFixture(f.id).catch(() => null)
    if (!r) continue
    agg.examined += r.examined; agg.exactConfirmed += r.exactConfirmed; agg.upgraded += r.upgraded
    agg.unresolved += r.unresolved; agg.ambiguous += r.ambiguous; agg.links.push(...r.links)
  }
  return agg
}

export async function explainUnresolvedLinks(fixtureId: string): Promise<string[]> {
  const r = await repairLinksForFixture(fixtureId)
  return r.unresolved > 0 ? [`${r.unresolved} alerta(s) sem decisão de governança vinculável (candidateAlertId ausente).`] : ['Todos os alertas têm vínculo (algum nível).']
}
