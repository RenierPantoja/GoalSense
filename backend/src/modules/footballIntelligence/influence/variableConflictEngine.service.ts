/**
 * Variable Conflict Engine (B46 / Bloco 3) — PURE.
 * ─────────────────────────────────────────────────────────────────────────────
 * Surfaces conflicts so they are never resolved silently: provider × manual,
 * memory supports × lineup contradicts, H2H supports × current context contradicts,
 * pattern supported × critical provider data missing, probable × confirmed lineup,
 * strong team memory × bad recent sample, stale domain × recent manual. Each conflict
 * carries a recommended (advisory) action — it never blocks the real alert engine.
 */
import type {
  VariableInfluenceInput, VariableInfluenceAssessment, VariableConflict, VariableConflictType, VariableConflictAction,
} from './variableInfluence.types.js'

let seq = 0
function cid(): string { seq = (seq + 1) % 1e9; return `vcf_${Date.now().toString(36)}_${seq.toString(36)}` }

function has(keys: Set<string>, k: string): boolean { return keys.has(k) }

function mk(
  fixtureId: string, patternId: string | null, conflictType: VariableConflictType,
  severity: VariableConflict['severity'], involvedVariables: string[],
  recommendedAction: VariableConflictAction, reason: string, limitations: string[] = [],
): VariableConflict {
  return { id: cid(), fixtureId, patternId, conflictType, severity, involvedVariables, recommendedAction, reason, limitations }
}

export function detectVariableConflicts(
  fixtureId: string, patternId: string | null,
  variables: VariableInfluenceInput[], assessments: VariableInfluenceAssessment[],
): VariableConflict[] {
  const keys = new Set(variables.map(v => v.variableKey))
  const out: VariableConflict[] = []

  // provider vs manual.
  if (has(keys, 'manual_data_conflict')) {
    out.push(mk(fixtureId, patternId, 'provider_vs_manual', 'high', ['manual_data_conflict'], 'operator_review', 'Conflito provider × manual — revisar antes de decidir.'))
  }
  // probable vs confirmed lineup.
  if (has(keys, 'lineup_conflict')) {
    out.push(mk(fixtureId, patternId, 'probable_vs_confirmed_lineup', 'high', ['lineup_conflict'], 'wait', 'Escalação provável diverge da confirmada — esperar/confirmar.'))
  }
  // memory supports vs lineup contradicts (e.g. memory supports pattern but lineup missing/weakened).
  const memSupports = assessments.some(a => (a.variableKey === 'team_memory_supports_pattern' || a.variableKey === 'matchup_memory_supports_pattern') && a.supports)
  const lineupWeak = has(keys, 'attack_weakened') || has(keys, 'defensive_line_weakened') || has(keys, 'key_player_missing')
  if (memSupports && lineupWeak) {
    out.push(mk(fixtureId, patternId, 'memory_vs_lineup', 'medium', ['team_memory_supports_pattern', 'attack_weakened'], 'downgrade', 'Memória apoia o padrão, mas a escalação atual o enfraquece — rebaixar.'))
  }
  // H2H supports vs current context contradicts.
  const h2hSupports = assessments.some(a => a.variableKey === 'matchup_memory_supports_pattern' && a.supports)
  const contextContradicts = assessments.some(a => a.variableKey === 'team_memory_contradicts_pattern' && a.contradicts)
  if (h2hSupports && contextContradicts) {
    out.push(mk(fixtureId, patternId, 'h2h_vs_context', 'medium', ['matchup_memory_supports_pattern', 'team_memory_contradicts_pattern'], 'downgrade', 'Confronto direto apoia, mas o contexto atual contradiz.'))
  }
  // pattern supported but critical provider data missing.
  const anySupport = assessments.some(a => a.supports)
  if (anySupport && has(keys, 'critical_data_missing')) {
    out.push(mk(fixtureId, patternId, 'pattern_vs_missing_provider', 'medium', ['critical_data_missing'], 'wait', 'Há apoio, mas falta dado crítico — esperar/colher manual.', ['Ausência não é fato negativo.']))
  }
  // strong team memory vs bad recent sample (misleading_risk surfaced as sample_too_small with conflicting reliability).
  const misleading = variables.some(v => v.variableKey === 'sample_too_small' && v.sampleQuality === 'misleading_risk')
  if (memSupports && misleading) {
    out.push(mk(fixtureId, patternId, 'memory_vs_recent_sample', 'low', ['team_memory_supports_pattern', 'sample_too_small'], 'downgrade', 'Memória parece apoiar, mas a amostra recente é fraca/enganosa.'))
  }
  // stale domain vs recent manual.
  if (has(keys, 'provider_domain_stale') && has(keys, 'manual_data_high_reliability')) {
    out.push(mk(fixtureId, patternId, 'stale_domain_vs_recent_manual', 'low', ['provider_domain_stale', 'manual_data_high_reliability'], 'use_manual_high_reliability', 'Domínio de provider stale, mas há manual recente confiável — usar manual com badge.'))
  }

  return out
}
