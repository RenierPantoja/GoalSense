/**
 * Variable Influence Rule Engine (B46 / Bloco 3) — PURE.
 * ─────────────────────────────────────────────────────────────────────────────
 * Deterministic, testable rules that turn a variable + a pattern's sensitivity into
 * an influence assessment. NO ML, NO probability, NO invented strength. Encodes:
 *   - absence/limitation variables never become negative facts;
 *   - weak sample reduces magnitude; conflicting reliability can block;
 *   - missing critical data → wait/stay-out (not "negative");
 *   - manual high-reliability supports (with manual badge); manual low → caution;
 *   - unknown/insufficient → uncertain, never failed.
 */
import { getVariableDefinition, getDefaultDirectionRules, isAbsenceLimitation } from './variableTaxonomy.service.js'
import type {
  VariableInfluenceInput, VariableInfluenceAssessment, VariableInfluenceDirection,
  VariableInfluenceMagnitude, VariableInfluenceReliability, PatternVariableSensitivityProfile,
} from './variableInfluence.types.js'

let seq = 0
function aid(): string { seq = (seq + 1) % 1e9; return `via_${Date.now().toString(36)}_${seq.toString(36)}` }

export function classifyReliability(v: VariableInfluenceInput): VariableInfluenceReliability {
  // Reliability already carried by the input; normalize odd combos.
  if (v.reliability) return v.reliability
  if (v.dataQuality === 'unavailable') return 'unavailable'
  if (v.sampleQuality === 'weak') return 'weak_sample'
  return 'unknown'
}

export function classifyMagnitude(v: VariableInfluenceInput, sensitivity: PatternVariableSensitivityProfile): VariableInfluenceMagnitude {
  const rel = classifyReliability(v)
  // Absence/limitation variables never carry positive/negative magnitude.
  if (isAbsenceLimitation(v.variableKey)) return 'unknown'
  if (rel === 'unavailable' || rel === 'unknown') return 'unknown'

  const isCritical = sensitivity.criticalVariables.includes(v.variableKey)
  const isLowImpact = sensitivity.lowImpactVariables.includes(v.variableKey)
  const isSensitiveCategory = sensitivity.sensitiveCategories.includes(v.category)

  // Weak sample / stale / conflicting cap the magnitude hard.
  if (rel === 'weak_sample' || rel === 'stale') return 'low'
  if (rel === 'conflicting') return 'medium'

  // player_importance unknown must never become critical.
  if (v.variableKey === 'key_player_missing' && (v.sampleQuality === 'unknown' || rel === 'low')) return 'medium'

  if (isCritical && rel === 'high') return sensitivity.patternFamily === 'unknown' ? 'medium' : 'critical'
  if (isCritical) return 'high'
  if (isLowImpact) return 'low'
  if (isSensitiveCategory) return rel === 'high' ? 'medium' : 'low'
  return 'low'
}

export function detectBlockingInfluence(v: VariableInfluenceInput, sensitivity: PatternVariableSensitivityProfile): boolean {
  if (sensitivity.blockingVariables.includes(v.variableKey)) return true
  if (v.variableKey === 'lineup_conflict' || v.variableKey === 'manual_data_conflict') return true
  return false
}

export function detectWaitInfluence(v: VariableInfluenceInput, sensitivity: PatternVariableSensitivityProfile): boolean {
  if (sensitivity.waitVariables.includes(v.variableKey)) return true
  if (v.variableKey === 'lineup_missing' || v.variableKey === 'provider_domain_stale' || v.variableKey === 'critical_data_missing') return true
  return false
}

export function detectLiveConfirmationInfluence(v: VariableInfluenceInput, sensitivity: PatternVariableSensitivityProfile): boolean {
  if (sensitivity.liveConfirmationVariables.includes(v.variableKey)) return true
  return v.variableKey === 'live_stats_unavailable'
}

export function assessVariableInfluence(v: VariableInfluenceInput, sensitivity: PatternVariableSensitivityProfile): VariableInfluenceAssessment {
  const def = getVariableDefinition(v.variableKey)
  const rel = classifyReliability(v)
  let direction: VariableInfluenceDirection = getDefaultDirectionRules(v.variableKey)
  const limitations = [...v.limitations]

  // Absence/limitation: force uncertain/wait, never negative fact.
  if (isAbsenceLimitation(v.variableKey)) {
    if (detectWaitInfluence(v, sensitivity)) direction = 'wait'
    else if (detectLiveConfirmationInfluence(v, sensitivity)) direction = 'live_confirmation_required'
    else direction = 'uncertain'
    limitations.push('Variável de ausência — não vira fato negativo.')
  } else if (detectBlockingInfluence(v, sensitivity)) {
    direction = 'blocking'
  } else if (detectWaitInfluence(v, sensitivity)) {
    direction = 'wait'
  } else if (detectLiveConfirmationInfluence(v, sensitivity)) {
    direction = 'live_confirmation_required'
  }

  // Reliability degradation softens supportive/contradictory into uncertain when too weak.
  if ((direction === 'positive' || direction === 'negative') && (rel === 'unavailable' || rel === 'unknown')) {
    direction = 'uncertain'
    limitations.push('Confiabilidade insuficiente — rebaixado para incerteza.')
  }
  if ((direction === 'positive' || direction === 'negative') && rel === 'weak_sample') {
    limitations.push('Amostra fraca — magnitude reduzida, sem conclusão forte.')
  }
  if (rel === 'conflicting') {
    limitations.push('Dado conflitante — tratar com cautela.')
  }

  const magnitude = classifyMagnitude(v, sensitivity)
  const supports = direction === 'positive'
  const contradicts = direction === 'negative'
  const blocks = direction === 'blocking'
  const waitReason = direction === 'wait' ? (def?.explanation ?? 'Esperar dado crítico/temporal.') : null
  const liveConfirmationReason = direction === 'live_confirmation_required' ? 'Exige confirmação ao vivo (sem stats).' : null

  const reason = `${def?.label ?? v.variableKey}: ${def?.explanation ?? 'sem definição'} [${v.source}/${rel}/${magnitude}]`

  return {
    id: aid(),
    fixtureId: v.fixtureId, patternId: v.patternId ?? null, variableKey: v.variableKey, category: v.category,
    label: v.label, direction, magnitude, reliability: rel, source: v.source,
    reason, evidenceRefs: v.evidenceRefs ?? [],
    contradicts, supports, blocks, waitReason, liveConfirmationReason,
    limitations: [...new Set(limitations)], createdAt: new Date().toISOString(),
  }
}

export function assessVariables(variables: VariableInfluenceInput[], sensitivity: PatternVariableSensitivityProfile): VariableInfluenceAssessment[] {
  return variables.map(v => assessVariableInfluence(v, sensitivity))
}

export function explainInfluence(a: VariableInfluenceAssessment): string {
  return `${a.label}: ${a.direction} (${a.magnitude}, ${a.reliability}) — ${a.reason}`
}
