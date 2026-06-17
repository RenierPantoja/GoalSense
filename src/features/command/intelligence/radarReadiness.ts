/**
 * Radar Readiness Engine — Radar Blueprint 3.0 (logic-first)
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for whether a radar draft can be saved, reviewed,
 * activated or diagnosed by the engine. No component should decide on its own —
 * every CTA derives from `getRadarReadiness`.
 *
 * Core ideas:
 *  - A condition has an OPERATIONAL KIND: eligibility | signal | blocker | context.
 *    "Partida ao vivo" / "Minuto entre" are ELIGIBILITY (when to evaluate), not a
 *    real opportunity SIGNAL. Activating requires at least one real signal.
 *  - Defaults (scope "all", action "register_alert", rigor 50%) are NOT user
 *    confirmations; they surface as warnings, not as completed decisions.
 *  - Backend compatibility is verified against the worker's evaluator. A radar
 *    that uses a condition the engine cannot evaluate cannot be activated.
 *
 * Pure module: no React, no side effects, no network. Safe to unit test.
 */
import type { PatternAction, PatternCondition, PatternConditionType, PatternScope, PatternSeverity } from '../types/commandTypes'
import {
  classifyConditionKind as classifyKind,
  getCapability,
  unsupportedConditionsOf,
  BACKEND_EXECUTABLE,
  type ConditionKind,
} from './radarConditionCapabilities'

// ─── Condition operational kind (re-exported from the capability matrix) ───────

export type { ConditionKind }

/** Classify a condition by operational role (delegates to the capability matrix). */
export function classifyConditionKind(condition: PatternCondition): ConditionKind {
  return classifyKind(condition)
}

// ─── Backend executor contract ─────────────────────────────────────────────────

/** Condition types the backend Pattern Worker can actually evaluate. */
export const BACKEND_SUPPORTED_CONDITIONS = BACKEND_EXECUTABLE

// ─── Data dependency mapping ────────────────────────────────────────────────────

/** Human label of the data each condition depends on (from capability matrix). */
function conditionDataDependency(type: PatternConditionType): string | null {
  const deps = getCapability(type).dataDependencies
  return deps.length > 0 ? deps[0] : null
}

/** Conditions whose underlying data is not always available across providers. */
function isFragileDependency(type: PatternConditionType): boolean {
  const cap = getCapability(type)
  return cap.kind === 'signal' && (cap.backendSupport === 'partial' || cap.dataDependencies.some(d => d !== 'placar' && d !== 'minuto' && d !== 'status ao vivo'))
}

// ─── Condition validity ──────────────────────────────────────────────────────

/** A condition is structurally valid if its numeric params make sense. */
export function isConditionValid(c: PatternCondition): boolean {
  const p = c.params
  if (c.type === 'minute_between') {
    const min = Number(p.min), max = Number(p.max)
    return Number.isFinite(min) && Number.isFinite(max) && min <= max && min >= 0 && max <= 130
  }
  for (const k of ['value', 'maxDiff', 'minutes']) {
    if (p[k] !== undefined) {
      const v = Number(p[k])
      if (!Number.isFinite(v) || v < 0) return false
    }
  }
  return true
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type RadarReadinessStatus =
  | 'empty'
  | 'draft'
  | 'incomplete'
  | 'valid_paused'
  | 'ready_for_review'
  | 'ready_to_activate'
  | 'blocked'

export interface RadarDraftInput {
  name: string
  conditions: PatternCondition[]
  scope: PatternScope
  scopeFilter?: string[]
  matches?: string[]
  action: PatternAction
  minConfidence: number
  severity: PatternSeverity
  requireRichData?: boolean
  onlyLive?: boolean
  onlyPreMatch?: boolean
}

export interface RadarReadinessFlags {
  /** User has opened/confirmed the executable contract (review). */
  reviewed?: boolean
  actionTouched?: boolean
  scopeTouched?: boolean
  confidenceTouched?: boolean
  severityTouched?: boolean
}

export interface BackendCompatibility {
  compatible: boolean
  unsupported: PatternConditionType[]
  /** action that does not register a tracked alert. */
  resolutionMode: 'tracked' | 'suggest' | 'highlight'
}

export interface RadarReadiness {
  status: RadarReadinessStatus
  canSaveDraft: boolean
  canSavePaused: boolean
  canActivate: boolean
  canRunEngineDiagnostic: boolean
  errors: string[]
  warnings: string[]
  requirements: string[]
  dataDependencies: string[]
  backendCompatibility: BackendCompatibility
  maturityLabel: string
  primaryMessage: string
  counts: { eligibility: number; signal: number; blocker: number; context: number }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function scopeNeedsSelection(scope: PatternScope): boolean {
  return scope === 'specific_leagues' || scope === 'specific_teams' || scope === 'specific_matches'
}
function scopeHasSelection(draft: RadarDraftInput): boolean {
  if (draft.scope === 'specific_matches') return (draft.matches?.length || 0) > 0
  if (draft.scope === 'specific_leagues' || draft.scope === 'specific_teams') return (draft.scopeFilter?.length || 0) > 0
  return true
}

// ─── Contract ──────────────────────────────────────────────────────────────────

export interface RadarContract {
  scope: PatternScope
  scopeLabel: string
  eligibilityConditions: PatternCondition[]
  signalConditions: PatternCondition[]
  blockerConditions: PatternCondition[]
  contextConditions: PatternCondition[]
  action: PatternAction
  confidence: number
  severity: PatternSeverity
  resolutionMode: 'tracked' | 'suggest' | 'highlight'
  dataDependencies: string[]
  backendCompatibility: BackendCompatibility
}

export function scopeLabelOf(draft: RadarDraftInput): string {
  const n = draft.scope === 'specific_matches' ? (draft.matches?.length || 0) : (draft.scopeFilter?.length || 0)
  switch (draft.scope) {
    case 'favorites_only': return 'apenas favoritos'
    case 'specific_leagues': return `${n} liga${n === 1 ? '' : 's'}`
    case 'specific_teams': return `${n} time${n === 1 ? '' : 's'}`
    case 'specific_matches': return `${n} partida${n === 1 ? '' : 's'}`
    default: return 'todos os jogos'
  }
}

function dataDependenciesOf(conditions: PatternCondition[]): string[] {
  const set = new Set<string>()
  for (const c of conditions) {
    const dep = conditionDataDependency(c.type)
    if (dep) set.add(dep)
  }
  return [...set]
}

function backendCompatibilityOf(draft: RadarDraftInput): BackendCompatibility {
  const unsupported = unsupportedConditionsOf(draft.conditions)
  const resolutionMode: BackendCompatibility['resolutionMode'] =
    draft.action === 'register_alert' ? 'tracked' : draft.action === 'suggest_only' ? 'suggest' : 'highlight'
  return { compatible: unsupported.length === 0, unsupported, resolutionMode }
}

export function compileRadarContract(draft: RadarDraftInput): RadarContract {
  const eligibilityConditions: PatternCondition[] = []
  const signalConditions: PatternCondition[] = []
  const blockerConditions: PatternCondition[] = []
  const contextConditions: PatternCondition[] = []
  for (const c of draft.conditions) {
    const kind = classifyConditionKind(c)
    if (kind === 'eligibility') eligibilityConditions.push(c)
    else if (kind === 'signal') signalConditions.push(c)
    else if (kind === 'blocker') blockerConditions.push(c)
    else contextConditions.push(c)
  }
  const compat = backendCompatibilityOf(draft)
  return {
    scope: draft.scope,
    scopeLabel: scopeLabelOf(draft),
    eligibilityConditions,
    signalConditions,
    blockerConditions,
    contextConditions,
    action: draft.action,
    confidence: draft.minConfidence,
    severity: draft.severity,
    resolutionMode: compat.resolutionMode,
    dataDependencies: dataDependenciesOf(draft.conditions),
    backendCompatibility: compat,
  }
}

// ─── Readiness ───────────────────────────────────────────────────────────────

export function getRadarReadiness(draft: RadarDraftInput, flags: RadarReadinessFlags = {}): RadarReadiness {
  const contract = compileRadarContract(draft)
  const counts = {
    eligibility: contract.eligibilityConditions.length,
    signal: contract.signalConditions.length,
    blocker: contract.blockerConditions.length,
    context: contract.contextConditions.length,
  }

  const hasName = draft.name.trim().length > 0
  const hasConditions = draft.conditions.length > 0
  const invalidConditions = draft.conditions.filter(c => !isConditionValid(c))
  const conditionsValid = invalidConditions.length === 0
  const hasSignal = counts.signal >= 1
  const scopeOk = scopeHasSelection(draft)
  const compat = contract.backendCompatibility

  const errors: string[] = []
  if (!hasName) errors.push('Dê um nome ao radar')
  if (!hasConditions) errors.push('Adicione ao menos uma condição')
  if (hasConditions && !conditionsValid) errors.push(`Ajuste os valores de ${invalidConditions.length} condição(ões) inválida(s)`)
  if (scopeNeedsSelection(draft.scope) && !scopeOk) {
    const what = draft.scope === 'specific_leagues' ? 'liga(s)' : draft.scope === 'specific_teams' ? 'time(s)' : 'partida(s)'
    errors.push(`Selecione ${what} para o escopo escolhido`)
  }

  // Activation-specific requirements (beyond technical validity)
  const requirements: string[] = []
  if (!hasSignal) requirements.push('Adicione ao menos 1 sinal real (filtros como "ao vivo" não bastam)')
  if (!compat.compatible) requirements.push(`Remova condição não suportada pelo motor: ${compat.unsupported.join(', ')}`)
  if (!flags.reviewed) requirements.push('Revise o contrato do radar antes de ativar')

  const warnings: string[] = []
  if (draft.scope === 'all' && !flags.scopeTouched) warnings.push('Escopo amplo: todos os jogos (padrão)')
  if (!flags.actionTouched) warnings.push('Ação ainda usa o padrão: registrar alerta')
  if (draft.minConfidence < 40) warnings.push('Rigor baixo pode gerar muitos alertas')
  if (counts.eligibility === 0 && hasSignal) warnings.push('Sem filtro de tempo: o radar avalia em qualquer minuto')
  const fragile = draft.conditions.some(c => isFragileDependency(c.type))
  if (fragile) warnings.push('Depende de estatística (pode faltar em alguns jogos/provedores)')
  const partial = draft.conditions.filter(c => getCapability(c.type).backendSupport === 'partial')
  if (partial.length > 0) warnings.push(`Cobertura variável: ${partial.map(c => getCapability(c.type).label).join(', ')}`)
  if (contract.resolutionMode !== 'tracked') warnings.push('Esta ação não registra alerta acompanhado pela resolução')

  // Technical validity = can persist as a real paused pattern that the engine
  // could run (name + signal + scope ok + conditions valid + backend compatible).
  const technicallyValid = hasName && hasConditions && conditionsValid && hasSignal && scopeOk && compat.compatible
  const hardErrors = errors.length > 0

  // Status
  let status: RadarReadinessStatus
  if (!hasName && (!hasConditions || (draft.conditions.length === 1 && classifyConditionKind(draft.conditions[0]) === 'eligibility'))) {
    status = 'empty'
  } else if (!compat.compatible && hasConditions) {
    status = 'blocked'
  } else if (hardErrors || !hasSignal) {
    status = hasName ? 'incomplete' : 'draft'
  } else if (!flags.reviewed) {
    status = 'ready_for_review'
  } else {
    status = 'ready_to_activate'
  }

  // CTA gates
  const canSaveDraft = hasName // early save allowed (persists as paused)
  const canSavePaused = technicallyValid
  const canActivate = technicallyValid && !!flags.reviewed
  const canRunEngineDiagnostic = hasConditions && conditionsValid

  const maturityLabel = ({
    empty: 'Vazio',
    draft: 'Rascunho',
    incomplete: 'Incompleto',
    valid_paused: 'Válido (pausado)',
    ready_for_review: 'Pronto para revisão',
    ready_to_activate: 'Pronto para ativar',
    blocked: 'Bloqueado',
  } as Record<RadarReadinessStatus, string>)[status]

  const primaryMessage =
    status === 'blocked' ? `Condição não suportada pelo motor: ${compat.unsupported.join(', ')}`
    : status === 'empty' ? 'Comece dando um nome e adicionando um sinal'
    : status === 'draft' || status === 'incomplete'
      ? (!hasSignal ? 'Adicione ao menos 1 sinal real para avançar' : (errors[0] || 'Complete os campos obrigatórios'))
    : status === 'ready_for_review' ? 'Tecnicamente válido — revise o contrato para ativar'
    : 'Pronto para ativar'

  return {
    status, canSaveDraft, canSavePaused, canActivate, canRunEngineDiagnostic,
    errors, warnings, requirements,
    dataDependencies: contract.dataDependencies,
    backendCompatibility: compat,
    maturityLabel, primaryMessage, counts,
  }
}
