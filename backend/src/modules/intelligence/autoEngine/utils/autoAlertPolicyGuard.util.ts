/**
 * Auto Alert Policy guard (Phase B25) — PURE, env-free, smoke-testable.
 * ─────────────────────────────────────────────────────────────────────────────
 * Evaluates an opportunity against a policy + calibration + flags and returns
 * explainable gates + a decision. NEVER creates anything — the service decides
 * whether the `auto_created` intent may actually be executed. Conservative: a
 * single failed CRITICAL gate ⇒ blocked. `unknown` is never a failure.
 */
import type { SampleQuality } from '../../contracts/learning.types.js'
import type {
  AutoAlertPolicy, AutoAlertPolicyGate, AutoAlertPolicyDecision,
  AutoAlertCalibrationSnapshot, AutoAlertScoreSnapshot, AutoAlertRiskGateSnapshot,
} from '../autoAlertPolicy.types.js'

type AutoAlertMode = AutoAlertPolicy['mode']

const SAMPLE_RANK: Record<SampleQuality, number> = { insufficient: 0, low: 1, moderate: 2, strong: 3 }
const CRITICAL_BLOCKERS = new Set(['data_poor', 'missing_required_data', 'too_much_unknown', 'provider_stale', 'not_live'])
const MAX_UNKNOWN_RATE = 0.6
const MAX_FAILED_RATE = 0.6

export interface PolicyGuardInput {
  policy: AutoAlertPolicy
  score: AutoAlertScoreSnapshot
  league: string
  homeTeam: string
  awayTeam: string
  minuteWindow: string
  dataQuality: string
  riskGate: AutoAlertRiskGateSnapshot
  calibration: AutoAlertCalibrationSnapshot
  dismissed: boolean
  alreadyPromoted: boolean
  isDuplicate: boolean
  perFixtureCount: number
  perRunCount: number
  flags: { policyEnabled: boolean; createEnabled: boolean; toAlertsEnabled: boolean }
}

export interface PolicyGuardResult {
  gates: AutoAlertPolicyGate[]
  decision: AutoAlertPolicyDecision
  canAutoCreate: boolean
  reasons: string[]
  limitations: string[]
}

function gate(name: string, passed: boolean, severity: AutoAlertPolicyGate['severity'], reason: string, evidence: string | null = null): AutoAlertPolicyGate {
  return { name, passed, severity, reason, evidence }
}

export function evaluatePolicyGates(input: PolicyGuardInput): PolicyGuardResult {
  const { policy, score, riskGate, calibration } = input
  const gates: AutoAlertPolicyGate[] = []
  const limitations: string[] = []

  // ── Policy enabled / mode ──
  if (!input.flags.policyEnabled || !policy.enabled || policy.mode === 'disabled') {
    return {
      gates: [gate('policy_enabled', false, 'critical', 'Política desabilitada (flag ou policy.enabled=false ou mode=disabled).')],
      decision: 'skipped_policy_disabled', canAutoCreate: false,
      reasons: ['Política desabilitada — nada avaliado.'],
      limitations: ['Avaliação de política desligada por padrão (shadow-first).'],
    }
  }

  // ── Duplicate / already-promoted / dismissed (skip vs block) ──
  if (input.isDuplicate || input.alreadyPromoted) {
    return {
      gates: [gate('not_duplicate', false, 'critical', 'Oportunidade já promovida / alerta duplicado.')],
      decision: 'skipped_duplicate', canAutoCreate: false,
      reasons: ['Já existe alerta para esta oportunidade.'], limitations: [],
    }
  }

  // ── Critical eligibility gates ──
  const statusOk = score.status === 'strong' || score.status === 'watch'
  gates.push(gate('opportunity_status', statusOk, 'critical', statusOk ? 'Status forte/observação.' : `Status "${score.status}" não é promovível.`, score.status))

  const scoreOk = score.score >= policy.minScore
  gates.push(gate('min_score', scoreOk, 'critical', scoreOk ? `Score ${score.score} ≥ mínimo ${policy.minScore}.` : `Score ${score.score} < mínimo ${policy.minScore}.`, String(score.score)))

  const bandOk = policy.allowedConfidenceBands.length === 0 || policy.allowedConfidenceBands.includes(score.confidenceBand)
  gates.push(gate('confidence_band', bandOk, bandOk ? 'info' : 'critical', bandOk ? `Banda ${score.confidenceBand} permitida.` : `Banda ${score.confidenceBand} não permitida.`, score.confidenceBand))

  const dqAllowed = policy.allowedDataQuality.length === 0 || policy.allowedDataQuality.includes(input.dataQuality)
  const dqPoorBlocked = (input.dataQuality === 'poor' && !policy.allowPoorData) || (input.dataQuality === 'unknown' && !policy.allowUnknownData)
  const dqOk = dqAllowed && !dqPoorBlocked
  gates.push(gate('data_quality', dqOk, 'critical', dqOk ? `Qualidade de dados "${input.dataQuality}" permitida.` : `Qualidade de dados "${input.dataQuality}" bloqueada por padrão.`, input.dataQuality))
  if (input.dataQuality === 'poor' || input.dataQuality === 'unknown') limitations.push('Dados pobres/desconhecidos: melhor bloquear do que criar alerta fraco.')

  if (policy.requireNoCriticalBlockers) {
    const crit = riskGate.blockReasons.filter(b => CRITICAL_BLOCKERS.has(b))
    const noCrit = riskGate.allowed && crit.length === 0
    gates.push(gate('no_critical_blockers', noCrit, 'critical', noCrit ? 'Sem bloqueios críticos no risk gate.' : `Bloqueios críticos: ${crit.join(', ') || 'risk gate bloqueou'}.`, crit.join(',') || null))
  }

  gates.push(gate('not_dismissed', !input.dismissed, 'critical', input.dismissed ? 'Oportunidade foi ignorada pelo usuário.' : 'Não ignorada.'))

  const fixtureOk = input.perFixtureCount < policy.maxPerFixture
  gates.push(gate('max_per_fixture', fixtureOk, 'critical', fixtureOk ? `Abaixo do limite por jogo (${policy.maxPerFixture}).` : `Limite por jogo atingido (${policy.maxPerFixture}).`, String(input.perFixtureCount)))

  const runOk = input.perRunCount < policy.maxPerRun
  gates.push(gate('max_per_run', runOk, 'critical', runOk ? `Abaixo do limite por scan (${policy.maxPerRun}).` : `Limite por scan atingido (${policy.maxPerRun}).`, String(input.perRunCount)))

  // ── League / team allow-block ──
  const leagueOk = (policy.allowedLeagues.length === 0 || policy.allowedLeagues.includes(input.league)) && !policy.blockedLeagues.includes(input.league)
  gates.push(gate('league_allowed', leagueOk, 'critical', leagueOk ? 'Liga permitida.' : `Liga "${input.league}" não permitida.`, input.league))

  const teamBlocked = policy.blockedTeams.includes(input.homeTeam) || policy.blockedTeams.includes(input.awayTeam)
  const teamAllowed = policy.allowedTeams.length === 0 || policy.allowedTeams.includes(input.homeTeam) || policy.allowedTeams.includes(input.awayTeam)
  const teamOk = teamAllowed && !teamBlocked
  gates.push(gate('team_allowed', teamOk, teamOk ? 'info' : 'critical', teamOk ? 'Times permitidos.' : 'Time bloqueado ou fora da lista permitida.'))

  // ── Minute window (warning) ──
  const windowOk = policy.minuteWindows.length === 0 || policy.minuteWindows.includes(input.minuteWindow)
  gates.push(gate('minute_window', windowOk, windowOk ? 'info' : 'warning', windowOk ? 'Janela de minuto permitida.' : `Janela "${input.minuteWindow}" fora da política (aviso).`, input.minuteWindow))

  // ── Calibration gates (B24) ──
  if (policy.requireCalibration) {
    const present = calibration.hasTypeProfile
    gates.push(gate('calibration_present', present, 'critical', present ? 'Perfil de calibração presente para o tipo.' : 'Sem calibração para este tipo — bloqueado (requireCalibration).', null))
    if (present) {
      const sqOk = calibration.sampleQuality != null && SAMPLE_RANK[calibration.sampleQuality] >= SAMPLE_RANK[policy.minSampleQuality]
      gates.push(gate('calibration_sample_quality', sqOk, 'critical', sqOk ? `Amostra ${calibration.sampleQuality} ≥ ${policy.minSampleQuality}.` : `Amostra ${calibration.sampleQuality ?? '—'} abaixo de ${policy.minSampleQuality}.`, calibration.sampleQuality))
      const bucketOk = !calibration.scoreBucketInsufficient
      gates.push(gate('score_bucket_sample', bucketOk, 'warning', bucketOk ? 'Faixa de score com amostra suficiente.' : 'Faixa de score marcada como amostra insuficiente.', null))
      const unknownOk = calibration.unknownRate == null || calibration.unknownRate <= MAX_UNKNOWN_RATE
      gates.push(gate('calibration_unknown_rate', unknownOk, unknownOk ? 'info' : 'warning', unknownOk ? 'unknown sob controle.' : `unknown alto (${Math.round((calibration.unknownRate ?? 0) * 100)}%).`, null))
      const failedOk = calibration.failedRate == null || calibration.failedRate <= MAX_FAILED_RATE
      gates.push(gate('calibration_failed_rate', failedOk, failedOk ? 'info' : 'warning', failedOk ? 'failed sob controle.' : `failed alto (${Math.round((calibration.failedRate ?? 0) * 100)}%).`, null))
    } else {
      limitations.push('Calibração ausente — auto-create bloqueado por política.')
    }
  } else if (policy.requireLearningProfile && !calibration.hasTypeProfile) {
    gates.push(gate('learning_profile', false, 'critical', 'Política exige perfil de aprendizado e não há.', null))
  }

  // ── Decide ──
  const criticalFailed = gates.some(g => g.severity === 'critical' && !g.passed)
  const reasons = gates.filter(g => !g.passed).map(g => g.reason)

  if (criticalFailed) {
    return { gates, decision: 'blocked', canAutoCreate: false, reasons: reasons.length ? reasons : ['Bloqueado por gate crítico.'], limitations }
  }

  const mode: AutoAlertMode = policy.mode
  if (mode === 'suggest_manual') {
    return { gates, decision: 'suggest_manual_review', canAutoCreate: false, reasons: ['Gates ok — sugerir revisão manual.'], limitations }
  }
  if (mode === 'auto_create_monitored') {
    const canAutoCreate = input.flags.policyEnabled && input.flags.createEnabled && input.flags.toAlertsEnabled
    if (canAutoCreate) {
      return { gates, decision: 'auto_created', canAutoCreate: true, reasons: ['Gates ok + flags de criação habilitadas.'], limitations }
    }
    limitations.push('mode=auto_create, mas flags de criação desligadas → registrado como shadow (nada criado).')
    return { gates, decision: 'shadow_would_create', canAutoCreate: false, reasons: ['Gates ok — criaria, mas flags de criação estão desligadas.'], limitations }
  }
  // shadow_only
  return { gates, decision: 'shadow_would_create', canAutoCreate: false, reasons: ['Gates ok — criaria em shadow, mas nada foi criado.'], limitations }
}
