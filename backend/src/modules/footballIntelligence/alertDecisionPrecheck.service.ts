/**
 * Alert Decision Precheck (Match Intelligence Fabric) — observe-first.
 * ─────────────────────────────────────────────────────────────────────────────
 * Before a pattern becomes an alert, consult the Match Intelligence Package and
 * emit an advisory decision (allow / block / wait / downgrade / post_match_only).
 * Ships in `observe` mode and NEVER blocks a real alert. Flag-gated; does not touch
 * the alert engine, score, confidence, counters or results.
 */
import { env } from '../../env.js'
import { buildMatchIntelligencePackage, type MatchIntelligencePackage } from './matchIntelligencePackage.service.js'

export type PrecheckDecision =
  | 'allow_alert' | 'block_alert' | 'wait_for_lineup' | 'wait_for_live_confirmation'
  | 'downgrade_to_monitor' | 'post_match_only'

export interface PrecheckGate { gate: string; passed: boolean; detail: string }

export interface AlertDecisionPrecheckResult {
  fixtureId: string
  mode: 'observe' | 'enforce'
  enabled: boolean
  decision: PrecheckDecision
  enforced: boolean
  gates: PrecheckGate[]
  reasons: string[]
  limitations: string[]
  generatedAt: string
}

function flag(v: unknown): boolean { return String(v).toLowerCase() === 'true' }
export function isPrecheckEnabled(): boolean { return flag(env.ENABLE_ALERT_DECISION_PRECHECK) }
export function precheckMode(): 'observe' | 'enforce' { return String(env.ALERT_DECISION_PRECHECK_MODE) === 'enforce' ? 'enforce' : 'observe' }

export function evaluatePrecheckFromPackage(pkg: MatchIntelligencePackage): Omit<AlertDecisionPrecheckResult, 'fixtureId' | 'mode' | 'enabled' | 'enforced' | 'generatedAt'> {
  const gates: PrecheckGate[] = []
  const reasons: string[] = []
  const limitations = ['Precheck observacional: não bloqueia alerta real em modo observe; nunca altera score/confiança/resultado.']

  const readiness = pkg.readiness
  const squad = pkg.squads

  // Gate: critical data present.
  const criticalMissing = readiness?.missingCriticalData ?? []
  gates.push({ gate: 'critical_data', passed: criticalMissing.length === 0, detail: criticalMissing.length ? `Faltando: ${criticalMissing.join(', ')}` : 'OK' })

  // Gate: lineup readiness.
  const lineupPending = !!squad?.waitForLineupRecommended
  gates.push({ gate: 'lineup_ready', passed: !lineupPending, detail: lineupPending ? 'Escalação pendente (janela ~1h).' : 'OK/n.a.' })

  // Gate: live confirmation (if live, need stats).
  const liveNoStats = pkg.phase === 'live' && !(pkg.live?.hasStats)
  gates.push({ gate: 'live_confirmation', passed: !liveNoStats, detail: liveNoStats ? 'Ao vivo sem stats.' : 'OK/n.a.' })

  // Gate: volatility/context not extreme.
  const extremeVolatility = pkg.context?.volatilityRisk === 'high'
  gates.push({ gate: 'context_volatility', passed: !extremeVolatility, detail: extremeVolatility ? 'Contexto muito volátil (mata-mata/decisão).' : 'OK' })

  // Gate: provider coverage / history.
  const insufficientHistory = readiness?.status === 'insufficient_history'
  gates.push({ gate: 'history_base', passed: !insufficientHistory, detail: insufficientHistory ? 'Sem memória interna suficiente.' : 'OK' })

  // Decision logic (advisory).
  let decision: PrecheckDecision = 'allow_alert'
  if (pkg.phase === 'post_match') { decision = 'post_match_only'; reasons.push('Jogo finalizado — apenas estudo pós-jogo.') }
  else if (lineupPending) { decision = 'wait_for_lineup'; reasons.push('Esperar escalação antes de decidir.') }
  else if (liveNoStats) { decision = 'wait_for_live_confirmation'; reasons.push('Esperar confirmação ao vivo (sem stats).') }
  else if (criticalMissing.length > 0) { decision = 'block_alert'; reasons.push('Dados críticos ausentes.') }
  else if (extremeVolatility || insufficientHistory) { decision = 'downgrade_to_monitor'; reasons.push('Contexto volátil / base histórica fraca — monitorar em vez de alertar forte.') }
  else { decision = 'allow_alert'; reasons.push('Sem bloqueios fundamentais — candidato a alerta (gates finais do motor de alerta ainda valem).') }

  return { decision, gates, reasons, limitations }
}

export async function runAlertDecisionPrecheck(fixtureId: string): Promise<AlertDecisionPrecheckResult> {
  const enabled = isPrecheckEnabled()
  const mode = precheckMode()
  const pkg = await buildMatchIntelligencePackage(fixtureId).catch(() => null)
  if (!pkg) {
    return { fixtureId, mode, enabled, decision: 'allow_alert', enforced: false, gates: [], reasons: ['Pacote indisponível — precheck não aplicável (não bloqueia).'], limitations: ['Fixture não encontrada ou pacote indisponível.'], generatedAt: new Date().toISOString() }
  }
  const evald = evaluatePrecheckFromPackage(pkg)
  // Enforced only when enabled AND mode=enforce AND decision is a block/wait. Even then,
  // this function only REPORTS enforcement intent — it is not wired into the alert engine.
  const enforced = enabled && mode === 'enforce' && evald.decision !== 'allow_alert'
  return { fixtureId, mode, enabled, enforced, ...evald, generatedAt: new Date().toISOString() }
}
