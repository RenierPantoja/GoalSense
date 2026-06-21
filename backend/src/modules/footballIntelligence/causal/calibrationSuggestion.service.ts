/**
 * Calibration Suggestion Engine (B48 / Bloco 5) — PURE aggregation.
 * ─────────────────────────────────────────────────────────────────────────────
 * Aggregates classified cases into conservative refinement suggestions for governance
 * and variable influence. NEVER auto-applies (`autoApplyAllowed=false`,
 * `reviewStatus='pending'`), requires a minimum sample, and reports honest confidence
 * (weak sample → insufficient). It does NOT change runtime/score/confidence/patterns/enforce.
 */
import { env } from '../../../env.js'
import type {
  CausalLearningCase, GovernanceCalibrationSuggestion, VariableInfluenceCalibrationSuggestion, CalibrationConfidence,
} from './causalLearning.types.js'

function minMedium(): number { return Number(env.CAUSAL_MIN_CASES_FOR_MEDIUM_SUGGESTION ?? 10) }
function minHigh(): number { return Number(env.CAUSAL_MIN_CASES_FOR_HIGH_SUGGESTION ?? 25) }
export function suggestionsEnabled(): boolean { return String(env.ENABLE_CAUSAL_CALIBRATION_SUGGESTIONS).toLowerCase() === 'true' }

function confidenceFor(n: number): CalibrationConfidence {
  if (n >= minHigh()) return 'high'
  if (n >= minMedium()) return 'medium'
  if (n >= 3) return 'low'
  return 'insufficient'
}

let seq = 0
function gid(area: string): string { seq = (seq + 1) % 1e9; return `gcs_${area}_${seq.toString(36)}` }
function vid(key: string): string { seq = (seq + 1) % 1e9; return `vcs_${key}_${seq.toString(36)}` }

export function suggestGovernancePolicyRefinements(cases: CausalLearningCase[]): GovernanceCalibrationSuggestion[] {
  if (!suggestionsEnabled()) return []
  const evaluable = cases.filter(c => c.evaluable)
  const out: GovernanceCalibrationSuggestion[] = []

  const tooStrict = evaluable.filter(c => c.classification === 'overconservative' || c.failureCategories.includes('governance_too_strict'))
  const tooLoose = evaluable.filter(c => c.failureCategories.includes('governance_too_loose') || c.failureCategories.includes('ignored_blocker') || c.failureCategories.includes('ignored_wait_reason'))

  const now = new Date().toISOString()
  if (tooStrict.length >= 3) {
    out.push({
      id: gid('too_strict'), policyArea: 'block/wait gates', currentBehavior: 'Bloqueia/espera em alguns contextos onde o resultado confirmou.',
      observedIssue: `${tooStrict.length} casos de possível conservadorismo excessivo.`, suggestedChange: 'Considerar afrouxar gate específico (apenas revisão humana).',
      evidenceCount: tooStrict.length, sampleQuality: confidenceFor(tooStrict.length), confidenceOfSuggestion: confidenceFor(tooStrict.length),
      risk: 'medium', autoApplyAllowed: false, reviewStatus: 'pending', createdAt: now, reviewedAt: null, reviewedBy: null,
      limitations: ['Sugestão não aplica mudança; exige revisão humana; amostra pequena = insufficient.'],
    })
  }
  if (tooLoose.length >= 3) {
    out.push({
      id: gid('too_loose'), policyArea: 'allow gate', currentBehavior: 'Permite/ignora wait/block em contextos que falharam.',
      observedIssue: `${tooLoose.length} casos onde wait/block foi ignorado e o resultado falhou.`, suggestedChange: 'Reforçar gate de espera/bloqueio (apenas revisão humana).',
      evidenceCount: tooLoose.length, sampleQuality: confidenceFor(tooLoose.length), confidenceOfSuggestion: confidenceFor(tooLoose.length),
      risk: 'high', autoApplyAllowed: false, reviewStatus: 'pending', createdAt: now, reviewedAt: null, reviewedBy: null,
      limitations: ['Sugestão não aplica mudança; exige revisão humana.'],
    })
  }
  return out
}

export function suggestVariableInfluenceRefinements(cases: CausalLearningCase[]): VariableInfluenceCalibrationSuggestion[] {
  if (!suggestionsEnabled()) return []
  const evaluable = cases.filter(c => c.evaluable)
  const out: VariableInfluenceCalibrationSuggestion[] = []
  const now = new Date().toISOString()

  const over = evaluable.filter(c => c.failureCategories.includes('influence_overestimated'))
  const weak = evaluable.filter(c => c.failureCategories.includes('weak_sample_overweighted') || c.failureCategories.includes('memory_misleading'))

  if (over.length >= 3) {
    out.push({
      id: vid('influence_over'), variableKey: 'aggregate_supportive', patternFamily: 'mixed', issue: 'overestimated',
      suggestedMagnitudeChange: 'Reduzir magnitude de variáveis favoráveis de baixa confiabilidade.',
      evidenceCount: over.length, sampleQuality: confidenceFor(over.length), confidenceOfSuggestion: confidenceFor(over.length),
      autoApplyAllowed: false, reviewStatus: 'pending', createdAt: now, reviewedAt: null, reviewedBy: null,
      limitations: ['Sugestão não aplica mudança; exige revisão humana.'],
    })
  }
  if (weak.length >= 3) {
    out.push({
      id: vid('weak_sample'), variableKey: 'sample_too_small', patternFamily: 'mixed', issue: 'weak_sample',
      suggestedMagnitudeChange: 'Rebaixar peso quando sample weak/misleading_risk.',
      evidenceCount: weak.length, sampleQuality: confidenceFor(weak.length), confidenceOfSuggestion: confidenceFor(weak.length),
      autoApplyAllowed: false, reviewStatus: 'pending', createdAt: now, reviewedAt: null, reviewedBy: null,
      limitations: ['Sugestão não aplica mudança; exige revisão humana.'],
    })
  }
  return out
}

export function suggestMemoryRefinements(cases: CausalLearningCase[]): GovernanceCalibrationSuggestion[] {
  if (!suggestionsEnabled()) return []
  const mem = cases.filter(c => c.evaluable && (c.failureCategories.includes('memory_misleading')))
  if (mem.length < 3) return []
  const now = new Date().toISOString()
  return [{
    id: gid('memory'), policyArea: 'memory weighting', currentBehavior: 'Memória pesa mesmo com amostra fraca em alguns casos.',
    observedIssue: `${mem.length} casos de memória enganosa.`, suggestedChange: 'Exigir amostra forte antes de pesar memória (revisão humana).',
    evidenceCount: mem.length, sampleQuality: confidenceFor(mem.length), confidenceOfSuggestion: confidenceFor(mem.length),
    risk: 'low', autoApplyAllowed: false, reviewStatus: 'pending', createdAt: now, reviewedAt: null, reviewedBy: null,
    limitations: ['Sugestão não aplica mudança; exige revisão humana.'],
  }]
}

export function suggestDataAcquisitionRefinements(cases: CausalLearningCase[]): GovernanceCalibrationSuggestion[] {
  if (!suggestionsEnabled()) return []
  const dac = cases.filter(c => c.evaluable && (c.failureCategories.includes('missing_critical_domain') || c.classification === 'provider_limited'))
  if (dac.length < 3) return []
  const now = new Date().toISOString()
  return [{
    id: gid('data_acquisition'), policyArea: 'data acquisition', currentBehavior: 'Alertas ocorrem sem domínio crítico em alguns casos.',
    observedIssue: `${dac.length} casos prejudicados por domínio ausente/provider limitado.`, suggestedChange: 'Priorizar aquisição/manual intake antes de alertar (revisão humana).',
    evidenceCount: dac.length, sampleQuality: confidenceFor(dac.length), confidenceOfSuggestion: confidenceFor(dac.length),
    risk: 'low', autoApplyAllowed: false, reviewStatus: 'pending', createdAt: now, reviewedAt: null, reviewedBy: null,
    limitations: ['Sugestão não aplica mudança; exige revisão humana.'],
  }]
}

export function suggestLiveRecheckRefinements(cases: CausalLearningCase[]): GovernanceCalibrationSuggestion[] {
  if (!suggestionsEnabled()) return []
  const live = cases.filter(c => c.evaluable && (c.classification === 'too_early' || c.failureCategories.includes('red_card_shock')))
  if (live.length < 3) return []
  const now = new Date().toISOString()
  return [{
    id: gid('live_recheck'), policyArea: 'live confirmation', currentBehavior: 'Alguns alertas ocorrem antes da confirmação ao vivo.',
    observedIssue: `${live.length} casos invalidados por evento ao vivo.`, suggestedChange: 'Exigir confirmação ao vivo para famílias sensíveis a choque (revisão humana).',
    evidenceCount: live.length, sampleQuality: confidenceFor(live.length), confidenceOfSuggestion: confidenceFor(live.length),
    risk: 'low', autoApplyAllowed: false, reviewStatus: 'pending', createdAt: now, reviewedAt: null, reviewedBy: null,
    limitations: ['Sugestão não aplica mudança; exige revisão humana.'],
  }]
}
