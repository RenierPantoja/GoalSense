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

// ─── Precheck V3 (B41) — provider + manual + conflict aware, observe-first ─────
import { buildFundamentalReadinessV3 } from './fundamentalReadinessEngine.service.js'
import { getLineupWindowStatusV2 } from './lineupWindowEngine.service.js'
import { buildSquadAvailabilityV2 } from './squadAvailabilityEngine.service.js'
import { buildPreMatchMergeReport } from './preMatchDataMerge.service.js'

export type PrecheckV3Decision =
  | 'avoid' | 'wait_for_lineup' | 'wait_for_manual_review' | 'wait_for_live_confirmation'
  | 'monitor' | 'alert_candidate' | 'strong_alert' | 'post_match_learning_only'

export interface AlertDecisionPrecheckV3Result {
  fixtureId: string
  mode: 'observe' | 'enforce'
  enabled: boolean
  enforced: boolean
  decision: PrecheckV3Decision
  reasons: string[]
  positiveFactors: string[]
  negativeFactors: string[]
  uncertaintyFactors: string[]
  stayOutReasons: string[]
  limitations: string[]
  generatedAt: string
}

export async function runAlertDecisionPrecheckV3(fixtureId: string): Promise<AlertDecisionPrecheckV3Result> {
  const enabled = isPrecheckEnabled()
  const mode = precheckMode()
  const out: AlertDecisionPrecheckV3Result = {
    fixtureId, mode, enabled, enforced: false, decision: 'monitor', reasons: [],
    positiveFactors: [], negativeFactors: [], uncertaintyFactors: [], stayOutReasons: [],
    limitations: ['Precheck V3 observacional: nunca bloqueia alerta real em observe; não altera score/confiança/resultado.'], generatedAt: new Date().toISOString(),
  }
  const pkg = await buildMatchIntelligencePackage(fixtureId).catch(() => null)
  if (!pkg) { out.reasons.push('Pacote indisponível — não aplicável.'); return out }

  const [readinessV3, lineupV2, squadV2, merge] = await Promise.all([
    buildFundamentalReadinessV3(fixtureId).catch(() => null),
    getLineupWindowStatusV2(fixtureId).catch(() => null),
    buildSquadAvailabilityV2(fixtureId).catch(() => null),
    buildPreMatchMergeReport(fixtureId).catch(() => null),
  ])

  const reasons: string[] = []
  const positive: string[] = []
  const negative: string[] = []
  const uncertain: string[] = []
  const stayOut: string[] = [...pkg.stayOutReasons]

  // Reason flags.
  if (lineupV2?.conflict || merge?.requiresReview) reasons.push('manual_data_conflicts_with_provider')
  if (lineupV2?.status === 'confirmed_available' && lineupV2.source === 'manual') reasons.push('trusted_lineup_confirmed')
  if (lineupV2?.conflict) reasons.push('lineup_conflict')
  if (squadV2 && !squadV2.injuries.available) reasons.push('injury_report_unavailable')
  if (squadV2 && !squadV2.suspensions.available) reasons.push('suspension_report_unavailable')
  if (squadV2 && squadV2.injuries.source === 'manual' && squadV2.injuries.items.length > 0) { reasons.push('key_absence_confirmed'); negative.push('ausência confirmada (manual)') }
  for (const b of readinessV3?.criticalDomainBlockers ?? []) reasons.push('provider_unconfigured_for_critical_domain')
  if ((readinessV3?.manualDataCoverage ?? 0) >= 50) { reasons.push('manual_data_supports_pattern'); positive.push('cobertura manual confiável') }

  // Decision.
  let decision: PrecheckV3Decision
  if (pkg.phase === 'post_match') decision = 'post_match_learning_only'
  else if (merge?.requiresReview || readinessV3?.status === 'wait_for_manual_review') decision = 'wait_for_manual_review'
  else if (readinessV3?.status === 'wait_for_lineup' || lineupV2?.shouldWait) decision = 'wait_for_lineup'
  else if (pkg.phase === 'live' && !(pkg.live?.hasStats)) decision = 'wait_for_live_confirmation'
  else if (readinessV3?.status === 'stay_out') { decision = 'avoid'; reasons.push('fundamentals_contradict_pattern') }
  else if (readinessV3?.status === 'provider_limited') decision = 'monitor'
  else if (readinessV3?.status === 'ready_with_provider_data' || readinessV3?.status === 'ready_with_manual_data') { decision = 'alert_candidate'; reasons.push('fundamentals_support_pattern') }
  else decision = 'monitor'

  out.decision = decision
  out.reasons = [...new Set(reasons)]
  out.positiveFactors = [...new Set([...positive, ...pkg.positiveFactors])]
  out.negativeFactors = [...new Set([...negative, ...pkg.negativeFactors])]
  out.uncertaintyFactors = [...new Set([...uncertain, ...pkg.uncertaintyFactors])]
  out.stayOutReasons = [...new Set([...stayOut, ...(readinessV3?.stayOutReasons ?? [])])]
  out.enforced = enabled && mode === 'enforce' && (decision === 'avoid' || decision.startsWith('wait'))
  return out
}

// ─── Precheck V4 (B43) — entity-mapping/domain-unlock aware, observe-first ─────
import { buildFundamentalReadinessV4 } from './fundamentalReadinessEngine.service.js'
import { getDomainUnlockStatus } from './identity/providerBridge.service.js'

export type PrecheckV4Decision =
  | 'avoid' | 'wait_for_lineup' | 'wait_for_manual_review' | 'wait_for_entity_mapping'
  | 'wait_for_live_confirmation' | 'monitor' | 'alert_candidate' | 'strong_alert' | 'post_match_learning_only'

export interface AlertDecisionPrecheckV4Result {
  fixtureId: string
  mode: 'observe' | 'enforce'
  enabled: boolean
  enforced: boolean
  decision: PrecheckV4Decision
  reasons: string[]
  limitations: string[]
  generatedAt: string
}

export async function runAlertDecisionPrecheckV4(fixtureId: string): Promise<AlertDecisionPrecheckV4Result> {
  const enabled = isPrecheckEnabled()
  const mode = precheckMode()
  const out: AlertDecisionPrecheckV4Result = {
    fixtureId, mode, enabled, enforced: false, decision: 'monitor', reasons: [],
    limitations: ['Precheck V4 observacional: nunca bloqueia alerta real em observe; não altera score/confiança/resultado.'], generatedAt: new Date().toISOString(),
  }
  const pkg = await buildMatchIntelligencePackage(fixtureId).catch(() => null)
  if (!pkg) { out.reasons.push('Pacote indisponível.'); return out }

  const [readinessV4, lineup, standings, injuries] = await Promise.all([
    buildFundamentalReadinessV4(fixtureId).catch(() => null),
    getDomainUnlockStatus(fixtureId, 'confirmed_lineups', 'api_football').catch(() => null),
    getDomainUnlockStatus(fixtureId, 'standings', 'api_football').catch(() => null),
    getDomainUnlockStatus(fixtureId, 'injuries', 'api_football').catch(() => null),
  ])
  const reasons: string[] = []
  if (injuries?.currentStatus === 'blocked_missing_mapping') reasons.push('missing_team_mapping')
  if (standings?.currentStatus === 'blocked_missing_mapping') reasons.push('missing_league_mapping')
  if (injuries?.currentStatus === 'blocked_ambiguous_mapping') reasons.push('ambiguous_team_mapping')
  if (standings?.currentStatus === 'blocked_ambiguous_mapping') reasons.push('ambiguous_league_mapping')
  if (lineup?.currentStatus === 'blocked_endpoint_not_implemented' || injuries?.currentStatus === 'blocked_endpoint_not_implemented') reasons.push('provider_domain_locked')
  if ((readinessV4?.criticalDomainsFilledByManual.length ?? 0) > 0) reasons.push('manual_data_available')
  if ((readinessV4?.providerUnlockProgress ?? 0) > 0) reasons.push('provider_data_unlocked')
  if (readinessV4?.mappingReviewRequired) reasons.push('operator_review_required')

  let decision: PrecheckV4Decision
  if (pkg.phase === 'post_match') decision = 'post_match_learning_only'
  else if (readinessV4?.status === 'wait_for_operator_mapping_review') decision = 'wait_for_manual_review'
  else if (pkg.squads?.waitForLineupRecommended) decision = 'wait_for_lineup'
  else if (readinessV4?.status === 'wait_for_entity_mapping') decision = 'wait_for_entity_mapping'
  else if (pkg.phase === 'live' && !(pkg.live?.hasStats)) decision = 'wait_for_live_confirmation'
  else if (readinessV4?.status === 'stay_out') decision = 'avoid'
  else if (readinessV4?.status === 'provider_unlocked_ready' || readinessV4?.status === 'manual_only_ready') decision = 'alert_candidate'
  else decision = 'monitor'

  out.decision = decision
  out.reasons = [...new Set(reasons)]
  out.enforced = enabled && mode === 'enforce' && (decision === 'avoid' || decision.startsWith('wait'))
  return out
}

// ─── Precheck V5 (B44) — critical domain-aware, observe-first ──────────────────
import { buildFundamentalReadinessV5 } from './fundamentalReadinessEngine.service.js'

export type PrecheckV5Decision =
  | 'avoid' | 'wait_for_lineup' | 'wait_for_domain_fetch' | 'wait_for_mapping' | 'wait_for_manual_review'
  | 'wait_for_live_confirmation' | 'monitor' | 'alert_candidate' | 'strong_alert' | 'post_match_learning_only'

export interface AlertDecisionPrecheckV5Result {
  fixtureId: string
  mode: 'observe' | 'enforce'
  enabled: boolean
  enforced: boolean
  decision: PrecheckV5Decision
  reasons: string[]
  limitations: string[]
  generatedAt: string
}

export async function runAlertDecisionPrecheckV5(fixtureId: string): Promise<AlertDecisionPrecheckV5Result> {
  const enabled = isPrecheckEnabled()
  const mode = precheckMode()
  const out: AlertDecisionPrecheckV5Result = {
    fixtureId, mode, enabled, enforced: false, decision: 'monitor', reasons: [],
    limitations: ['Precheck V5 observacional: nunca bloqueia alerta real em observe; não altera score/confiança/resultado.'], generatedAt: new Date().toISOString(),
  }
  const pkg = await buildMatchIntelligencePackage(fixtureId).catch(() => null)
  if (!pkg) { out.reasons.push('Pacote indisponível.'); return out }
  const v5 = await buildFundamentalReadinessV5(fixtureId).catch(() => null)

  const reasons: string[] = []
  if ((v5?.blockedCriticalDomains.length ?? 0) > 0) reasons.push('critical_domain_missing')
  if ((v5?.staleCriticalDomains.length ?? 0) > 0) reasons.push('critical_domain_stale')
  if ((v5?.providerNotConfiguredDomains.length ?? 0) > 0 || (v5?.endpointMissingDocsDomains.length ?? 0) > 0) reasons.push('critical_domain_provider_limited')
  if (v5?.blockedCriticalDomains.includes('injuries')) reasons.push('injuries_unknown')
  if (v5?.blockedCriticalDomains.includes('standings')) reasons.push('standings_missing')
  if (v5?.fetchedCriticalDomains.length) reasons.push('real_provider_data_supports_pattern')
  if (v5?.manualCriticalDomains.length) reasons.push('manual_data_supports_pattern')
  if (pkg.squads?.waitForLineupRecommended) reasons.push('lineup_not_confirmed')

  let decision: PrecheckV5Decision
  if (pkg.phase === 'post_match') decision = 'post_match_learning_only'
  else if (pkg.squads?.waitForLineupRecommended || v5?.status === 'wait_for_lineup') decision = 'wait_for_lineup'
  else if (v5?.status === 'wait_for_mapping') decision = 'wait_for_mapping'
  else if (v5?.status === 'wait_for_domain_fetch') decision = 'wait_for_domain_fetch'
  else if (pkg.phase === 'live' && !(pkg.live?.hasStats)) decision = 'wait_for_live_confirmation'
  else if (v5?.status === 'stay_out_data_insufficient') decision = 'avoid'
  else if (v5?.status === 'ready_with_real_provider_data' || v5?.status === 'ready_with_mixed_provider_manual_data') decision = 'alert_candidate'
  else decision = 'monitor'

  out.decision = decision
  out.reasons = [...new Set(reasons)]
  out.enforced = enabled && mode === 'enforce' && (decision === 'avoid' || decision.startsWith('wait'))
  return out
}

// ─── Precheck V6 (B45) — historical-memory aware, observe-first ────────────────
import { buildFundamentalReadinessV6 } from './fundamentalReadinessEngine.service.js'

export type PrecheckV6Decision =
  | 'avoid' | 'wait_for_lineup' | 'wait_for_live_confirmation' | 'wait_for_memory_build'
  | 'monitor' | 'alert_candidate' | 'strong_alert' | 'post_match_learning_only'

export interface AlertDecisionPrecheckV6Result {
  fixtureId: string
  mode: 'observe' | 'enforce'
  enabled: boolean
  enforced: boolean
  decision: PrecheckV6Decision
  reasons: string[]
  memorySupportFactors: string[]
  memoryCautionFactors: string[]
  limitations: string[]
  generatedAt: string
}

export async function runAlertDecisionPrecheckV6(fixtureId: string): Promise<AlertDecisionPrecheckV6Result> {
  const enabled = isPrecheckEnabled()
  const mode = precheckMode()
  const out: AlertDecisionPrecheckV6Result = {
    fixtureId, mode, enabled, enforced: false, decision: 'monitor', reasons: [],
    memorySupportFactors: [], memoryCautionFactors: [],
    limitations: ['Precheck V6 observacional: memória é apoio; nunca bloqueia alerta real em observe; não altera score/confiança/resultado.'], generatedAt: new Date().toISOString(),
  }
  const pkg = await buildMatchIntelligencePackage(fixtureId).catch(() => null)
  if (!pkg) { out.reasons.push('Pacote indisponível.'); return out }
  const v6 = await buildFundamentalReadinessV6(fixtureId).catch(() => null)

  const reasons: string[] = []
  const support: string[] = []
  const caution: string[] = []

  if (v6?.status === 'insufficient_memory') { reasons.push('memory_insufficient_history'); caution.push('Sem memória interna suficiente (insufficient_history).') }
  if (v6?.memorySupportsPattern) { reasons.push('team_memory_positive'); support.push(...v6.strongContexts.map(c => `contexto favorável: ${c}`)) }
  if (v6?.memoryContradictsPattern) { reasons.push('memory_contradicts_pattern'); caution.push(...v6.stayOutContexts.map(c => `contexto desfavorável: ${c}`)) }
  if ((v6?.misleadingContexts.length ?? 0) > 0) { reasons.push('stay_out_memory_misleading'); caution.push(...(v6?.misleadingContexts ?? []).map(c => `contexto enganoso: ${c}`)) }
  if (v6?.matchupMaturity === 'insufficient_data') reasons.push('matchup_memory_insufficient')
  else if (v6?.matchupMaturity === 'high') { reasons.push('matchup_memory_supported'); support.push('confronto direto maduro (apoio)') }

  let decision: PrecheckV6Decision
  if (pkg.phase === 'post_match') decision = 'post_match_learning_only'
  else if (pkg.squads?.waitForLineupRecommended) decision = 'wait_for_lineup'
  else if (pkg.phase === 'live' && !(pkg.live?.hasStats)) decision = 'wait_for_live_confirmation'
  else if (v6?.status === 'stay_out_memory_misleading') decision = 'monitor'
  else if (v6?.status === 'memory_contradicts_pattern') decision = 'monitor'
  else if (v6?.status === 'insufficient_memory') decision = 'monitor'
  else if (v6?.status === 'ready_with_memory_support') decision = 'alert_candidate'
  else decision = 'monitor'

  out.decision = decision
  out.reasons = [...new Set(reasons)]
  out.memorySupportFactors = [...new Set(support)]
  out.memoryCautionFactors = [...new Set(caution)]
  // Memory NEVER hard-blocks; even in enforce it only marks wait_* as enforceable intent.
  out.enforced = enabled && mode === 'enforce' && decision.startsWith('wait')
  return out
}
