/**
 * Causal Learning Case Builder (B48 / Bloco 5).
 * ─────────────────────────────────────────────────────────────────────────────
 * Assembles a CausalLearningCase from real artifacts: governance result (via the
 * Decision-Outcome Linker), the alert outcome, and the post-match explanation (for
 * shock/provider-limitation evidence). If the outcome is pending/unknown or the link
 * is weak, the case is honestly `not_evaluable`/`unknown` — never `failed`. Non-fatal.
 */
import { createRepositories } from '../../../repositories/index.js'
import { findBestGovernanceResultForAlert } from './decisionOutcomeLinker.service.js'
import { classifyCausalCase, type CausalClassifierInput } from './causalOutcomeClassifier.service.js'
import { buildPostMatchExplanation } from '../postMatchExplanationEngine.service.js'
import type { CausalLearningCase, DecisionTimelineEvent, DecisionLinkStrength } from './causalLearning.types.js'

function caseId(fixtureId: string, alertId: string | null): string { return `clc_${fixtureId}__${alertId ?? 'noalert'}` }

function buildTimeline(govResult: any, alertId: string | null, outcome: any): DecisionTimelineEvent[] {
  const tl: DecisionTimelineEvent[] = []
  if (govResult) tl.push({ timestamp: govResult.generatedAt, eventType: 'governance_decision', summary: `Governança: ${govResult.action} (${govResult.mode})`, refs: [govResult.id], limitations: [] })
  if (alertId) tl.push({ timestamp: outcome?.createdAt ?? new Date().toISOString(), eventType: 'alert_created', summary: `Alerta ${alertId} criado`, refs: [alertId], limitations: [] })
  if (outcome?.resolvedAt) tl.push({ timestamp: outcome.resolvedAt, eventType: 'outcome_resolved', summary: `Outcome: ${outcome.result}`, refs: [outcome.id], limitations: [] })
  return tl
}

export async function buildCaseForAlert(alertId: string, fixtureId: string, patternId: string | null): Promise<CausalLearningCase> {
  const repos = createRepositories()
  const [outcome, link, pm] = await Promise.all([
    repos.intelligence.getAlertOutcomeByAlertId(alertId).catch(() => null),
    findBestGovernanceResultForAlert(alertId, fixtureId, patternId).catch(() => ({ result: null, strength: 'unknown' as DecisionLinkStrength, reasons: [], ambiguous: false })),
    buildPostMatchExplanation(fixtureId).catch(() => null),
  ])

  const gov = link.result
  const outcomeResult = outcome?.result ?? null
  const evaluable = (outcomeResult === 'confirmed' || outcomeResult === 'confirmed_partial' || outcomeResult === 'failed') && link.strength !== 'unknown' && link.strength !== 'weak_contextual'

  const shockEvents: string[] = pm?.unexpectedEvents ?? []
  const hasRedCard = shockEvents.some(e => /vermelho|red_card/i.test(e))
  const hasLateGoal = shockEvents.some(e => /tardio|late/i.test(e))

  const input: CausalClassifierInput = {
    outcomeResult,
    governanceAction: gov?.action ?? null,
    wouldHaveBlocked: !!gov?.wouldHaveBlocked,
    wouldHaveWaited: !!gov?.action && String(gov.action).startsWith('wait_'),
    actualAlertCreated: !!alertId,
    linkStrength: link.strength,
    influenceBand: gov?.influenceBand ?? null,
    missingCriticalDomains: gov?.missingCriticalDomains ?? [],
    staleDomains: [],
    hasRedCardEvidence: hasRedCard,
    hasSubstitutionEvidence: false,
    hasInjuryEvidence: false,
    hasLateGoalEvidence: hasLateGoal,
    weakSampleUsed: gov?.confidenceOfAssessment === 'low',
    memoryMisleading: false,
    providerLimited: !!pm?.wasProviderLimited,
    conflicts: gov?.conflicts ?? [],
  }
  const cls = classifyCausalCase(input)

  return {
    id: caseId(fixtureId, alertId),
    fixtureId, patternId, alertId, candidateAlertId: gov?.candidateAlertId ?? null, opportunityId: gov?.opportunityId ?? null,
    governanceResultId: gov?.id ?? null, influenceLedgerId: gov?.decisionInputRefs?.[0] ?? null,
    signalLedgerId: null, outcomeId: outcome?.id ?? null,
    source: 'alert', createdAt: new Date().toISOString(), evaluatedAt: evaluable ? new Date().toISOString() : null,
    outcomeResult, governanceAction: gov?.action ?? null, linkStrength: link.strength,
    classification: cls.classification, successCategories: cls.successCategories, failureCategories: cls.failureCategories,
    decisionTimeline: buildTimeline(gov, alertId, outcome),
    evidenceRefs: [gov?.id, outcome?.id].filter(Boolean) as string[],
    dataQuality: (outcome?.dataQualityAtResolution ?? 'unknown') as CausalLearningCase['dataQuality'],
    evaluable,
    limitations: [...cls.limitations, ...link.reasons],
  }
}

export async function buildCasesForFixture(fixtureId: string): Promise<CausalLearningCase[]> {
  const repos = createRepositories()
  let alerts: any[] = []
  try { alerts = await repos.alerts.findByFixtureIds(fixtureId) } catch { /* noop */ }
  const out: CausalLearningCase[] = []
  for (const a of alerts) {
    const c = await buildCaseForAlert(a.id, fixtureId, a.patternId ?? null).catch(() => null)
    if (c) out.push(c)
  }
  return out
}

export async function buildCaseForOutcome(outcomeId: string): Promise<CausalLearningCase | null> {
  const repos = createRepositories()
  const outcomes = await repos.intelligence.listAllAlertOutcomes(2000).catch(() => [])
  const o = outcomes.find((x: any) => x.id === outcomeId)
  if (!o) return null
  return buildCaseForAlert(o.alertId, o.fixtureId, o.patternId ?? null)
}
