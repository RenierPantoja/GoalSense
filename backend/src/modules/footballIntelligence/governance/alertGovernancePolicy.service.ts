/**
 * Alert Governance Policy (B47 / Bloco 4) — PURE.
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralizes WHEN to allow / monitor / wait / downgrade / block / stay-out. Pure
 * and deterministic from already-computed inputs (readiness V7, precheck V7,
 * influence aggregate). Default mode is observe → it NEVER blocks a real alert.
 * Enforce is ultra-conservative and only via explicit flags. Not a probability.
 */
import { env } from '../../../env.js'
import type {
  AlertGovernanceMode, AlertDecisionAction, AlertDecisionSeverity,
  AlertGovernanceRecheckTrigger, AlertGovernanceHoldReason,
} from './alertDecisionGovernance.types.js'

export interface PolicyInputs {
  phase: string | null
  readinessV7Status: string | null
  precheckV7Decision: string | null
  influenceBand: string | null
  influenceScore: number | null
  confidenceOfAssessment: string | null
  blockerCount: number
  waitCount: number
  liveConfirmationCount: number
  contradictionCount: number
  conflicts: string[]
  missingCriticalDomains: string[]
  lineupPending: boolean
  liveNoStats: boolean
}

export interface PolicyDecision {
  action: AlertDecisionAction
  severity: AlertDecisionSeverity
  allowReasons: string[]
  monitorReasons: string[]
  waitReasons: string[]
  stayOutReasons: string[]
  blockers: string[]
  liveConfirmationReasons: string[]
}

function flag(v: unknown): boolean { return String(v).toLowerCase() === 'true' }

export function getGovernanceMode(): AlertGovernanceMode {
  if (!flag(env.ENABLE_ALERT_DECISION_GOVERNANCE)) return 'observe'
  const raw = String(env.ALERT_GOVERNANCE_MODE)
  const valid: AlertGovernanceMode[] = ['observe', 'shadow', 'shadow_block', 'enforce']
  let mode: AlertGovernanceMode = (valid.includes(raw as AlertGovernanceMode) ? raw : 'observe') as AlertGovernanceMode
  // Safety downgrades: enforce/shadow_block require their explicit flags, else fall back.
  if (mode === 'enforce' && !flag(env.ENABLE_ALERT_GOVERNANCE_ENFORCE)) mode = 'observe'
  if (mode === 'shadow_block' && !flag(env.ENABLE_ALERT_GOVERNANCE_SHADOW_BLOCK)) mode = 'observe'
  return mode
}

export function canEnforce(): boolean {
  return flag(env.ENABLE_ALERT_GOVERNANCE_ENFORCE) && getGovernanceMode() === 'enforce'
}

export function holdsEnabled(): boolean { return flag(env.ENABLE_ALERT_GOVERNANCE_HOLDS) }
export function liveRecheckEnabled(): boolean { return flag(env.ENABLE_ALERT_GOVERNANCE_LIVE_RECHECK) }
export function holdTtlMinutes(): number { return Number(env.ALERT_GOVERNANCE_HOLD_TTL_MINUTES ?? 180) }

export function getDefaultPolicy(): { description: string } {
  return { description: 'Observe-first; allow strong only with clean readiness/influence/no blockers; wait on temporal/critical gaps; block/stay-out only on critical contradictions/conflicts. Enforce ultra-conservative and flag-gated.' }
}

export function evaluatePolicyInputs(i: PolicyInputs): PolicyDecision {
  const allowReasons: string[] = []
  const monitorReasons: string[] = []
  const waitReasons: string[] = []
  const stayOutReasons: string[] = []
  const blockers: string[] = []
  const liveConfirmationReasons: string[] = []

  if (i.phase === 'post_match') {
    return { action: 'post_match_learning_only', severity: 'informational', allowReasons, monitorReasons: ['Jogo finalizado — apenas estudo pós-jogo.'], waitReasons, stayOutReasons, blockers, liveConfirmationReasons }
  }

  // Collect blocking signals.
  if (i.blockerCount > 0) blockers.push('Influência bloqueadora presente.')
  for (const c of i.conflicts) if (c.includes('operator_review')) blockers.push(`Conflito requer revisão: ${c}`)
  if (i.readinessV7Status === 'blocked_by_influence') blockers.push('Readiness V7: bloqueado por influência.')

  // Wait signals.
  if (i.lineupPending || i.precheckV7Decision === 'wait_for_lineup') waitReasons.push('Escalação pendente.')
  if (i.precheckV7Decision === 'wait_for_manual_review' || i.conflicts.some(c => c.includes('operator_review'))) waitReasons.push('Revisão manual pendente.')
  if (i.missingCriticalDomains.length > 0) waitReasons.push(`Domínio crítico pendente: ${i.missingCriticalDomains.join(', ')}.`)
  if (i.liveConfirmationCount > 0 || i.liveNoStats) liveConfirmationReasons.push('Confirmação ao vivo necessária (sem stats).')
  if (i.waitCount > 0 && waitReasons.length === 0) waitReasons.push('Variável temporal/crítica pendente.')

  // Stay-out / contradiction signals.
  if (i.influenceBand === 'contradictory') stayOutReasons.push('Influência contraditória.')
  if (i.readinessV7Status === 'insufficient_influence_data') stayOutReasons.push('Influência insuficiente para decidir.')
  if (i.precheckV7Decision === 'avoid') stayOutReasons.push('Precheck recomenda evitar.')

  // Monitor signals.
  if (i.influenceBand === 'mixed' || i.influenceBand === 'weak') monitorReasons.push('Influência mista/fraca — monitorar.')
  if (i.confidenceOfAssessment === 'low') monitorReasons.push('Confiança da avaliação baixa.')

  // Decide (priority: block > stay_out > wait/live > monitor > allow). Conservative.
  let action: AlertDecisionAction
  let severity: AlertDecisionSeverity
  if (blockers.length > 0) { action = 'block_alert'; severity = 'critical' }
  else if (stayOutReasons.length > 0 && i.influenceBand === 'contradictory') { action = 'stay_out'; severity = 'blocking' }
  else if (waitReasons.some(r => r.includes('Escalação'))) { action = 'wait_for_lineup'; severity = 'strong_caution' }
  else if (waitReasons.some(r => r.includes('Revisão manual'))) { action = 'wait_for_manual_review'; severity = 'strong_caution' }
  else if (waitReasons.some(r => r.includes('Domínio'))) { action = 'wait_for_domain_fetch'; severity = 'caution' }
  else if (liveConfirmationReasons.length > 0) { action = 'wait_for_live_confirmation'; severity = 'caution' }
  else if (waitReasons.length > 0) { action = 'wait_for_domain_fetch'; severity = 'caution' }
  else if (stayOutReasons.length > 0) { action = 'downgrade_to_monitor'; severity = 'strong_caution' }
  else if (monitorReasons.length > 0) { action = 'allow_monitor_only'; severity = 'caution' }
  else if (i.influenceBand === 'strongly_supportive' && i.confidenceOfAssessment === 'high') { action = 'allow_alert'; severity = 'informational'; allowReasons.push('Influência fortemente favorável e confiança alta.') }
  else if (i.influenceBand === 'supportive') { action = 'allow_alert'; severity = 'informational'; allowReasons.push('Influência favorável.') }
  else if (i.influenceBand === 'insufficient_data' || i.influenceBand === 'unknown' || !i.influenceBand) { action = 'allow_monitor_only'; severity = 'caution'; monitorReasons.push('Sem base de influência suficiente — monitorar (não negativo).') }
  else { action = 'allow_monitor_only'; severity = 'caution'; monitorReasons.push('Leitura neutra — monitorar.') }

  return { action, severity, allowReasons, monitorReasons, waitReasons, stayOutReasons, blockers, liveConfirmationReasons }
}

export function shouldCreateHold(action: AlertDecisionAction): AlertGovernanceHoldReason | null {
  switch (action) {
    case 'wait_for_lineup': return 'lineup_pending'
    case 'wait_for_domain_fetch': return 'domain_pending'
    case 'wait_for_mapping': return 'mapping_pending'
    case 'wait_for_manual_review': return 'manual_review_pending'
    case 'wait_for_live_confirmation': return 'live_confirmation_pending'
    default: return null
  }
}

export function shouldDowngradeToMonitor(action: AlertDecisionAction): boolean {
  return action === 'downgrade_to_monitor' || action === 'allow_monitor_only'
}

export function shouldBlockInEnforce(action: AlertDecisionAction): boolean {
  // Ultra-conservative: enforce blocks only hard block/stay_out.
  return action === 'block_alert' || action === 'stay_out'
}

export function shouldRecheckOnTrigger(trigger: AlertGovernanceRecheckTrigger): boolean {
  if (!liveRecheckEnabled()) return false
  return true
}

export function explainPolicyDecision(d: PolicyDecision): string {
  const parts: string[] = [d.action]
  if (d.blockers.length) parts.push(`bloqueadores: ${d.blockers.length}`)
  if (d.waitReasons.length) parts.push(`wait: ${d.waitReasons.length}`)
  if (d.allowReasons.length) parts.push('allow')
  return parts.join(' · ')
}
