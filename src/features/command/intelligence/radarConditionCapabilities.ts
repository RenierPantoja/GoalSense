/**
 * Radar Condition Capability Matrix — Phase 3.1 (single source of truth)
 * ─────────────────────────────────────────────────────────────────────────────
 * Central catalog describing, per condition type, what the GoalSense ENGINE can
 * actually do with it. Mirrors the backend worker's evaluator
 * (`backend/.../commandEvaluation.service.ts`) and diagnostic
 * (`radarDiagnostic.service.ts`). Every readiness/contract/editor decision
 * derives from here — no component decides backend support on its own.
 *
 * Pure module. No React, no side effects.
 */
import type { PatternCondition, PatternConditionType } from '../types/commandTypes'
import { TRIGGER_BY_TYPE } from './triggerLibrary'

export type ConditionKind = 'eligibility' | 'signal' | 'blocker' | 'context'
export type BackendSupport = 'supported' | 'partial' | 'unsupported'

export interface ConditionCapability {
  type: PatternConditionType
  label: string
  kind: ConditionKind
  backendSupport: BackendSupport
  /** May this condition be part of a radar that gets ACTIVATED? */
  activationAllowed: boolean
  /** May this condition be exercised by the engine diagnostic? */
  diagnosticAllowed: boolean
  dataDependencies: string[]
  requiredParams: string[]
  resolutionSupported: boolean
  reasonIfUnsupported?: string
  warningIfPartial?: string
}

// ─── Operational kind ──────────────────────────────────────────────────────────

const ELIGIBILITY_TYPES = new Set<PatternConditionType>(['is_live', 'is_pre_live', 'minute_between', 'is_final_phase'])
const CONTEXT_TYPES = new Set<PatternConditionType>(['favorite_involved'])

function kindOf(type: PatternConditionType): ConditionKind {
  if (ELIGIBILITY_TYPES.has(type)) return 'eligibility'
  if (CONTEXT_TYPES.has(type)) return 'context'
  return 'signal'
}

// ─── Backend support (mirrors the worker evaluator switch) ──────────────────────

/** Fully supported: evaluator handles it AND data is generally reliable. */
const SUPPORTED = new Set<PatternConditionType>([
  'is_live', 'minute_between', 'is_final_phase', 'score_tied', 'score_diff_lte',
  'goals_total_gte', 'goals_total_lte', 'possession_gte', 'home_possession_gte',
  'away_possession_gte', 'shots_on_target_gte', 'home_shots_on_target_gte',
  'away_shots_on_target_gte', 'shots_total_gte',
])
/** Evaluator handles it BUT provider coverage is variable (corners/cards). */
const PARTIAL = new Set<PatternConditionType>([
  'corners_gte', 'home_corners_gte', 'away_corners_gte', 'cards_gte',
])
// Everything else is unsupported by the backend worker.

function backendSupportOf(type: PatternConditionType): BackendSupport {
  if (SUPPORTED.has(type)) return 'supported'
  if (PARTIAL.has(type)) return 'partial'
  return 'unsupported'
}

// ─── Data dependencies ──────────────────────────────────────────────────────────

function dataDependenciesOf(type: PatternConditionType): string[] {
  switch (type) {
    case 'is_live': case 'is_pre_live': return ['status ao vivo']
    case 'minute_between': case 'is_final_phase': return ['minuto']
    case 'score_tied': case 'score_diff_lte': case 'goals_total_gte': case 'goals_total_lte':
    case 'home_goals_gte': case 'away_goals_gte': return ['placar']
    case 'shots_on_target_gte': case 'home_shots_on_target_gte': case 'away_shots_on_target_gte': return ['chutes no alvo']
    case 'shots_total_gte': case 'shots_recent_gte': return ['finalizações']
    case 'possession_gte': case 'home_possession_gte': case 'away_possession_gte': return ['posse de bola']
    case 'corners_gte': case 'home_corners_gte': case 'away_corners_gte': return ['escanteios']
    case 'cards_gte': case 'yellow_cards_gte': case 'red_cards_gte': return ['cartões']
    case 'favorite_involved': return ['favoritos']
    default: return []
  }
}

const UNSUPPORTED_REASON: Partial<Record<PatternConditionType, string>> = {
  is_pre_live: 'O motor só avalia partidas ao vivo (sem janela pré-jogo no worker)',
  favorite_involved: 'O motor não conhece seus favoritos no servidor',
  shots_recent_gte: 'O motor usa finalizações totais, não "recentes"',
  home_goals_gte: 'O motor avalia gols totais/diferença, não gols por mando',
  away_goals_gte: 'O motor avalia gols totais/diferença, não gols por mando',
  yellow_cards_gte: 'O motor avalia cartões totais, não amarelos isolados',
  red_cards_gte: 'O motor avalia cartões totais, não vermelhos isolados',
}

// ─── Build the matrix ───────────────────────────────────────────────────────────

const ALL_TYPES: PatternConditionType[] = [
  'is_live', 'is_pre_live', 'minute_between', 'is_final_phase',
  'score_tied', 'score_diff_lte', 'goals_total_gte', 'goals_total_lte', 'home_goals_gte', 'away_goals_gte',
  'shots_on_target_gte', 'home_shots_on_target_gte', 'away_shots_on_target_gte', 'shots_total_gte', 'shots_recent_gte',
  'possession_gte', 'home_possession_gte', 'away_possession_gte',
  'corners_gte', 'home_corners_gte', 'away_corners_gte',
  'cards_gte', 'yellow_cards_gte', 'red_cards_gte',
  'favorite_involved',
]

function buildCapability(type: PatternConditionType): ConditionCapability {
  const spec = TRIGGER_BY_TYPE[type]
  const support = backendSupportOf(type)
  const requiredParams = spec ? Object.keys(spec.defaultParams || {}) : []
  return {
    type,
    label: spec?.title || type,
    kind: kindOf(type),
    backendSupport: support,
    activationAllowed: support !== 'unsupported',
    diagnosticAllowed: support !== 'unsupported',
    dataDependencies: dataDependenciesOf(type),
    requiredParams,
    resolutionSupported: support !== 'unsupported',
    reasonIfUnsupported: support === 'unsupported' ? (UNSUPPORTED_REASON[type] || 'Não suportado pelo motor') : undefined,
    warningIfPartial: support === 'partial' ? 'Cobertura de dados varia por provedor' : undefined,
  }
}

export const CONDITION_CAPABILITIES: Record<PatternConditionType, ConditionCapability> =
  ALL_TYPES.reduce((acc, t) => { acc[t] = buildCapability(t); return acc }, {} as Record<PatternConditionType, ConditionCapability>)

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getCapability(type: PatternConditionType): ConditionCapability {
  return CONDITION_CAPABILITIES[type] || buildCapability(type)
}

export function classifyConditionKind(condition: PatternCondition): ConditionKind {
  return getCapability(condition.type).kind
}

/** Condition types the backend worker can evaluate (supported + partial). */
export const BACKEND_EXECUTABLE = new Set<PatternConditionType>(
  ALL_TYPES.filter(t => getCapability(t).activationAllowed),
)

export function unsupportedConditionsOf(conditions: PatternCondition[]): PatternConditionType[] {
  return [...new Set(conditions.map(c => c.type).filter(t => !getCapability(t).activationAllowed))]
}
