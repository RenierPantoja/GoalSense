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

// ─── Precheck V2 (B40) — provider/lineup/injury-aware, still observe-first ─────
import { buildFundamentalReadinessV2 } from './fundamentalReadinessEngine.service.js'
import { getLineupWindowStatus } from './lineupWindowEngine.service.js'
import { getBestProviderForDomain } from './providers/providerRegistry.service.js'

export type PrecheckV2Decision =
  | 'avoid' | 'wait_for_lineup' | 'wait_for_injury_suspension_update' | 'wait_for_live_confirmation'
  | 'monitor' | 'alert_candidate' | 'strong_alert' | 'post_match_learning_only'

export interface AlertDecisionPrecheckV2Result {
  fixtureId: string
  mode: 'observe' | 'enforce'
  enabled: boolean
  enforced: boolean
  decision: PrecheckV2Decision
  reasons: string[]
  positiveFactors: string[]
  negativeFactors: string[]
  uncertaintyFactors: string[]
  stayOutReasons: string[]
  limitations: string[]
  generatedAt: string
}

export async function runAlertDecisionPrecheckV2(fixtureId: string): Promise<AlertDecisionPrecheckV2Result> {
  const enabled = isPrecheckEnabled()
  const mode = precheckMode()
  const base: AlertDecisionPrecheckV2Result = {
    fixtureId, mode, enabled, enforced: false, decision: 'monitor', reasons: [],
    positiveFactors: [], negativeFactors: [], uncertaintyFactors: [], stayOutReasons: [],
    limitations: ['Precheck V2 observacional: nunca bloqueia alerta real em observe; não altera score/confiança/resultado.'], generatedAt: new Date().toISOString(),
  }
  const pkg = await buildMatchIntelligencePackage(fixtureId).catch(() => null)
  if (!pkg) { base.decision = 'monitor'; base.reasons.push('Pacote indisponível — não aplicável (não bloqueia).'); return base }

  const [readinessV2, lineupWindow] = await Promise.all([
    buildFundamentalReadinessV2(fixtureId).catch(() => null),
    getLineupWindowStatus(fixtureId).catch(() => null),
  ])

  const reasons: string[] = []
  const positive: string[] = []
  const negative: string[] = []
  const uncertain: string[] = []
  const stayOut: string[] = [...pkg.stayOutReasons]

  // Reason flags.
  if (lineupWindow?.shouldWait) reasons.push('lineup_pending')
  if (!getBestProviderForDomain('injuries')) reasons.push('provider_missing_injuries')
  if (!getBestProviderForDomain('suspensions')) reasons.push('provider_missing_suspensions')
  if (pkg.squads?.waitForLineupRecommended) uncertain.push('key_absence_unknown')
  if (pkg.h2h?.h2hReliability === 'insufficient_data') reasons.push('h2h_insufficient')
  if (pkg.context?.volatilityRisk === 'high') { reasons.push('context_high_volatility'); negative.push('alta volatilidade de contexto') }
  if (pkg.context?.competitionContext.isKnockout === true) reasons.push('knockout_context_requires_caution')

  const hasMemory = (pkg.teams.home?.sampleSize ?? 0) + (pkg.teams.away?.sampleSize ?? 0) > 0
  if (hasMemory) {
    const conf = (pkg.teams.home?.patternsConfirmed ?? 0) + (pkg.teams.away?.patternsConfirmed ?? 0)
    const fail = (pkg.teams.home?.patternsFailed ?? 0) + (pkg.teams.away?.patternsFailed ?? 0)
    if (conf > fail) { reasons.push('memory_supports_pattern'); positive.push('memória interna favorável') }
    else if (fail > conf) { reasons.push('memory_contradicts_pattern'); negative.push('memória interna desfavorável') }
  }

  // Decision logic (advisory).
  let decision: PrecheckV2Decision
  if (pkg.phase === 'post_match') decision = 'post_match_learning_only'
  else if (lineupWindow?.shouldWait || readinessV2?.status === 'wait_for_lineup') decision = 'wait_for_lineup'
  else if (readinessV2?.status === 'wait_for_injury_suspension_update') decision = 'wait_for_injury_suspension_update'
  else if (pkg.phase === 'live' && !(pkg.live?.hasStats)) decision = 'wait_for_live_confirmation'
  else if (readinessV2?.status === 'stay_out' || (stayOut.length > 0 && !hasMemory)) decision = 'avoid'
  else if (readinessV2?.status === 'provider_limited' || pkg.context?.volatilityRisk === 'high') decision = 'monitor'
  else if (hasMemory && positive.length > 0 && negative.length === 0) decision = 'alert_candidate'
  else decision = 'monitor'

  if (decision === 'avoid') reasons.push('fundamentals_contradict_pattern')
  if (decision === 'alert_candidate') reasons.push('fundamentals_support_pattern')

  base.decision = decision
  base.reasons = reasons
  base.positiveFactors = [...new Set([...positive, ...pkg.positiveFactors])]
  base.negativeFactors = [...new Set([...negative, ...pkg.negativeFactors])]
  base.uncertaintyFactors = [...new Set([...uncertain, ...pkg.uncertaintyFactors])]
  base.stayOutReasons = stayOut
  base.enforced = enabled && mode === 'enforce' && (decision === 'avoid' || decision.startsWith('wait'))
  if (readinessV2) base.limitations.push(`Cobertura de provider: ${readinessV2.providerCoverageScore}%.`)
  return base
}
