/**
 * Causal Outcome Classifier (B48 / Bloco 5) — PURE.
 * ─────────────────────────────────────────────────────────────────────────────
 * Deterministically classifies whether a decision was good/bad and why. Conservative:
 *   - governance said wait + alert failed → should_have_waited / ignored_wait_reason;
 *   - governance said block/stay_out + failed → should_have_stayed_out / ignored_blocker;
 *   - governance would block (shadow) but outcome was good → overconservative candidate;
 *   - red card/sub/injury with EVIDENCE → variance_or_shock (never "chance" without it);
 *   - missing critical domain → provider_limited / missing_critical_domain;
 *   - weak link or pending/unknown outcome → not_evaluable / unknown (never failed).
 */
import type {
  CausalOutcomeClassification, CausalFailureCategory, CausalSuccessCategory, DecisionLinkStrength,
} from './causalLearning.types.js'

export interface CausalClassifierInput {
  outcomeResult: string | null            // confirmed/confirmed_partial/failed/unknown/expired/pending/no_alert/null
  governanceAction: string | null         // allow_alert/wait_*/block_alert/stay_out/... or null
  wouldHaveBlocked: boolean
  wouldHaveWaited: boolean
  actualAlertCreated: boolean
  linkStrength: DecisionLinkStrength
  influenceBand: string | null
  missingCriticalDomains: string[]
  staleDomains?: string[]
  hasRedCardEvidence: boolean
  hasSubstitutionEvidence: boolean
  hasInjuryEvidence: boolean
  hasLateGoalEvidence?: boolean
  weakSampleUsed: boolean
  memoryMisleading: boolean
  providerLimited: boolean
  conflicts: string[]
}

export interface CausalClassification {
  classification: CausalOutcomeClassification
  successCategories: CausalSuccessCategory[]
  failureCategories: CausalFailureCategory[]
  limitations: string[]
}

function isConfirmed(r: string | null): boolean { return r === 'confirmed' || r === 'confirmed_partial' }
function isFailed(r: string | null): boolean { return r === 'failed' }
function isEvaluableOutcome(r: string | null): boolean { return isConfirmed(r) || isFailed(r) }

export function classifyVarianceOrShock(i: CausalClassifierInput): { isShock: boolean; categories: CausalFailureCategory[] } {
  const categories: CausalFailureCategory[] = []
  if (i.hasRedCardEvidence) categories.push('red_card_shock')
  if (i.hasSubstitutionEvidence) categories.push('substitution_shift')
  if (i.hasInjuryEvidence) categories.push('key_absence_missed')
  return { isShock: categories.length > 0, categories }
}

export function classifyCausalCase(i: CausalClassifierInput): CausalClassification {
  const limitations: string[] = ['Classificação causal não é probabilidade; vínculo contextual não prova causalidade.']
  const successCategories: CausalSuccessCategory[] = []
  const failureCategories: CausalFailureCategory[] = []

  // Not evaluable first.
  if (!isEvaluableOutcome(i.outcomeResult)) {
    limitations.push('Outcome pending/unknown/not_evaluable — não é falha.')
    return { classification: 'not_evaluable', successCategories, failureCategories, limitations }
  }
  if (i.linkStrength === 'unknown' || i.linkStrength === 'weak_contextual') {
    limitations.push('Vínculo decisão↔outcome fraco — evitar causalidade forte.')
    return { classification: 'unknown', successCategories, failureCategories, limitations }
  }

  const confirmed = isConfirmed(i.outcomeResult)
  const failed = isFailed(i.outcomeResult)
  const shock = classifyVarianceOrShock(i)

  // ── Failure paths ──
  if (failed) {
    // Ignored governance guidance (override against wait/block).
    if (i.actualAlertCreated && i.wouldHaveBlocked) {
      failureCategories.push('ignored_blocker', 'governance_too_loose')
      return { classification: 'should_have_stayed_out', successCategories, failureCategories, limitations }
    }
    if (i.actualAlertCreated && i.wouldHaveWaited) {
      failureCategories.push('ignored_wait_reason')
      return { classification: 'should_have_waited', successCategories, failureCategories, limitations }
    }
    // Data / provider limitation separated from bad analysis.
    if (i.missingCriticalDomains.length > 0) {
      failureCategories.push('missing_critical_domain', 'provider_limitation')
      return { classification: i.providerLimited ? 'provider_limited' : 'data_insufficient', successCategories, failureCategories, limitations }
    }
    if ((i.staleDomains?.length ?? 0) > 0) {
      failureCategories.push('stale_data')
      return { classification: 'data_insufficient', successCategories, failureCategories, limitations }
    }
    // Extreme/live shock WITH evidence → variance, not bad analysis.
    if (shock.isShock) {
      failureCategories.push(...shock.categories, 'true_variance')
      limitations.push('Falha com evidência de evento extremo — não rebaixar análise por acaso.')
      return { classification: 'variance_or_shock', successCategories, failureCategories, limitations }
    }
    // Overweighted weak inputs.
    if (i.weakSampleUsed) failureCategories.push('weak_sample_overweighted')
    if (i.memoryMisleading) failureCategories.push('memory_misleading')
    if (i.influenceBand === 'strongly_supportive' || i.influenceBand === 'supportive') failureCategories.push('influence_overestimated')
    if (i.conflicts.length > 0) failureCategories.push('manual_data_conflict')
    if (failureCategories.length === 0) {
      limitations.push('Falha sem evento extremo aparente — investigar (não assumir acaso).')
      failureCategories.push('unknown')
      return { classification: 'bad_decision_bad_outcome', successCategories, failureCategories, limitations }
    }
    return { classification: 'bad_decision_bad_outcome', successCategories, failureCategories, limitations }
  }

  // ── Success paths ──
  if (confirmed) {
    // Overconservative candidate: governance would have blocked/waited but outcome was good.
    if (i.wouldHaveBlocked) {
      successCategories.push('unknown')
      limitations.push('Governança bloquearia em shadow, mas o resultado confirmou — possível conservadorismo excessivo.')
      return { classification: 'overconservative', successCategories, failureCategories: ['governance_too_strict'], limitations }
    }
    if (i.wouldHaveWaited) {
      limitations.push('Governança esperaria, mas confirmou — avaliar timing (não conclusivo).')
      successCategories.push('governance_waited_correctly')
      return { classification: 'right_to_wait', successCategories, failureCategories, limitations }
    }
    if (i.influenceBand === 'strongly_supportive' || i.influenceBand === 'supportive') successCategories.push('influence_aligned', 'fundamentals_aligned')
    if (i.missingCriticalDomains.length === 0) successCategories.push('critical_domain_supported')
    if (successCategories.length === 0) successCategories.push('unknown')
    return { classification: 'good_decision_good_outcome', successCategories, failureCategories, limitations }
  }

  return { classification: 'unknown', successCategories, failureCategories, limitations }
}

export function classifyGovernanceQuality(i: CausalClassifierInput): 'aligned' | 'too_strict' | 'too_loose' | 'not_evaluable' {
  if (!isEvaluableOutcome(i.outcomeResult) || i.linkStrength === 'unknown' || i.linkStrength === 'weak_contextual') return 'not_evaluable'
  if (isFailed(i.outcomeResult) && (i.wouldHaveBlocked || i.wouldHaveWaited) && i.actualAlertCreated) return 'aligned'
  if (isFailed(i.outcomeResult) && !(i.wouldHaveBlocked || i.wouldHaveWaited)) return 'too_loose'
  if (isConfirmed(i.outcomeResult) && i.wouldHaveBlocked) return 'too_strict'
  return 'aligned'
}
