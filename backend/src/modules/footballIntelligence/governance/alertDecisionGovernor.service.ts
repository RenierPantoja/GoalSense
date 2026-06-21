/**
 * Alert Decision Governor (B47 / Bloco 4).
 * ─────────────────────────────────────────────────────────────────────────────
 * The single decision door. Consults influence (compose), Readiness V7, Precheck V7
 * and the base package phase, applies the Governance Policy, persists an auditable
 * result and (optionally) a hold. Observe/shadow by default → NEVER blocks a real
 * alert. `actuallyBlocked` is only ever true under explicit enforce. Non-fatal: on
 * any failure it returns a `no_decision` result with a limitation.
 */
import { createRepositories } from '../../../repositories/index.js'
import { env } from '../../../env.js'
import { composeInfluence } from '../influence/influenceLedger.service.js'
import { buildFundamentalReadinessV7 } from '../fundamentalReadinessEngine.service.js'
import { runAlertDecisionPrecheckV7 } from '../alertDecisionPrecheck.service.js'
import {
  getGovernanceMode, canEnforce, evaluatePolicyInputs, shouldBlockInEnforce,
  shouldDowngradeToMonitor, type PolicyInputs,
} from './alertGovernancePolicy.service.js'
import { createHoldFromDecision } from './alertGovernanceHold.service.js'
import type {
  AlertDecisionGovernanceInput, AlertDecisionGovernanceResult, AlertGovernanceMode, AlertDecisionAction,
} from './alertDecisionGovernance.types.js'

const LIVE = ['1H', '2H', 'HT', 'ET', 'BT', 'P']
const FINISHED = ['FT', 'AET', 'PEN']

let seq = 0
function resultId(): string { seq = (seq + 1) % 1e9; return `agr_${Date.now().toString(36)}_${seq.toString(36)}` }

export function isGovernanceEnabled(): boolean { return String(env.ENABLE_ALERT_DECISION_GOVERNANCE).toLowerCase() === 'true' }

function noDecision(input: AlertDecisionGovernanceInput, mode: AlertGovernanceMode, limitation: string): AlertDecisionGovernanceResult {
  return {
    id: resultId(), fixtureId: input.fixtureId, patternId: input.patternId ?? null,
    candidateAlertId: input.candidateAlertId ?? null, opportunityId: input.opportunityId ?? null,
    mode, source: input.source, action: 'no_decision', severity: 'informational', generatedAt: new Date().toISOString(),
    readinessStatus: null, precheckDecision: null, influenceBand: null, influenceScore: null, confidenceOfAssessment: null,
    blockers: [], waitReasons: [], stayOutReasons: [], monitorReasons: [], allowReasons: [], liveConfirmationReasons: [],
    missingCriticalDomains: [], conflicts: [], evidenceRefs: [], decisionInputRefs: [],
    wouldHaveBlocked: false, wouldHaveAllowed: false, actuallyBlocked: false, actuallyAllowed: false, actuallyDowngraded: false,
    limitations: [limitation, 'Decisão de governança não é probabilidade nem promessa de acerto.'],
  }
}

async function persist(result: AlertDecisionGovernanceResult): Promise<void> {
  try { await createRepositories().intelligence.saveAlertDecisionGovernanceResult(result) } catch { /* noop */ }
}

export async function evaluateAlertCandidate(input: AlertDecisionGovernanceInput): Promise<AlertDecisionGovernanceResult> {
  const mode = getGovernanceMode()
  if (!isGovernanceEnabled()) {
    const r = noDecision(input, 'observe', 'Governança desabilitada (ENABLE_ALERT_DECISION_GOVERNANCE=false).')
    return r
  }
  try {
    const repos = createRepositories()
    const fixture = await repos.fixtures.findById(input.fixtureId).catch(() => null)
    const status = input.matchStatus || fixture?.status || 'NS'
    const phase = FINISHED.includes(status) ? 'post_match' : status === 'HT' ? 'half_time' : LIVE.includes(status) ? 'live' : 'pre_match'

    const [composed, readinessV7, precheckV7] = await Promise.all([
      composeInfluence(input.fixtureId, input.patternId ?? null).catch(() => null),
      buildFundamentalReadinessV7(input.fixtureId).catch(() => null),
      runAlertDecisionPrecheckV7(input.fixtureId).catch(() => null),
    ])
    if (!composed && !readinessV7 && !precheckV7) {
      const r = noDecision(input, mode, 'Pacote V5/influência indisponível — sem base para decidir.')
      await persist(r)
      return r
    }

    const agg = composed?.aggregate ?? null
    const conflicts = (composed?.conflicts ?? []).map(c => `${c.conflictType}→${c.recommendedAction}`)
    const missingCriticalDomains = (composed?.variables ?? []).filter(v => v.variableKey === 'critical_data_missing').map(v => v.rawValue)

    const policyInputs: PolicyInputs = {
      phase,
      readinessV7Status: readinessV7?.status ?? null,
      precheckV7Decision: precheckV7?.decision ?? null,
      influenceBand: agg?.netInfluenceBand ?? null,
      influenceScore: agg?.influenceScore ?? null,
      confidenceOfAssessment: agg?.confidenceOfAssessment ?? null,
      blockerCount: agg?.blockingInfluences.length ?? 0,
      waitCount: agg?.waitInfluences.length ?? 0,
      liveConfirmationCount: agg?.liveConfirmationInfluences.length ?? 0,
      contradictionCount: agg?.negativeInfluences.length ?? 0,
      conflicts,
      missingCriticalDomains,
      lineupPending: precheckV7?.decision === 'wait_for_lineup' || (composed?.variables ?? []).some(v => v.variableKey === 'lineup_missing'),
      liveNoStats: phase === 'live' && (composed?.variables ?? []).some(v => v.variableKey === 'live_stats_unavailable'),
    }

    const decision = evaluatePolicyInputs(policyInputs)
    const action = decision.action

    // Shadow vs enforce semantics.
    const isBlockingAction = action === 'block_alert' || action === 'stay_out'
    const wouldHaveBlocked = isBlockingAction
    const wouldHaveAllowed = action === 'allow_alert'
    const enforce = canEnforce()
    const actuallyBlocked = enforce && shouldBlockInEnforce(action)
    const actuallyDowngraded = enforce && shouldDowngradeToMonitor(action)
    const actuallyAllowed = !actuallyBlocked && (action === 'allow_alert' || mode !== 'enforce')

    const result: AlertDecisionGovernanceResult = {
      id: resultId(), fixtureId: input.fixtureId, patternId: input.patternId ?? null,
      candidateAlertId: input.candidateAlertId ?? null, opportunityId: input.opportunityId ?? null,
      mode, source: input.source, action, severity: decision.severity, generatedAt: new Date().toISOString(),
      readinessStatus: readinessV7?.status ?? null,
      precheckDecision: precheckV7?.decision ?? null,
      influenceBand: agg?.netInfluenceBand ?? null,
      influenceScore: agg?.influenceScore ?? null,
      confidenceOfAssessment: agg?.confidenceOfAssessment ?? null,
      blockers: decision.blockers, waitReasons: decision.waitReasons, stayOutReasons: decision.stayOutReasons,
      monitorReasons: decision.monitorReasons, allowReasons: decision.allowReasons, liveConfirmationReasons: decision.liveConfirmationReasons,
      missingCriticalDomains, conflicts,
      evidenceRefs: [], decisionInputRefs: composed ? [`ile_${input.fixtureId}__${input.patternId ?? 'fixture'}`] : [],
      wouldHaveBlocked, wouldHaveAllowed, actuallyBlocked, actuallyDowngraded, actuallyAllowed,
      limitations: [
        `Modo ${mode}: ${mode === 'enforce' ? 'enforce ativo (ultra-conservador)' : 'observacional — NÃO bloqueia alerta real'}.`,
        'Decisão de governança não é probabilidade nem promessa de acerto.',
      ],
    }
    await persist(result)
    if (action.startsWith('wait_')) await createHoldFromDecision(result).catch(() => null)
    return result
  } catch (e: any) {
    const r = noDecision(input, mode, `Falha na governança (não bloqueia): ${e?.message || e}`)
    await persist(r).catch(() => null)
    return r
  }
}

export async function evaluatePatternCandidate(fixtureId: string, patternId: string, source: AlertDecisionGovernanceInput['source'] = 'command_pattern', candidateAlertId?: string | null): Promise<AlertDecisionGovernanceResult> {
  return evaluateAlertCandidate({ fixtureId, patternId, candidateAlertId: candidateAlertId ?? null, source })
}

export async function evaluateOpportunity(opportunityId: string): Promise<AlertDecisionGovernanceResult | null> {
  const repos = createRepositories()
  const opp = await repos.intelligence.getAutoOpportunity(opportunityId).catch(() => null)
  if (!opp) return null
  return evaluateAlertCandidate({ fixtureId: (opp as any).fixtureId, patternId: null, opportunityId, source: 'auto_engine_opportunity' })
}

export async function evaluatePromotedOpportunity(opportunityId: string): Promise<AlertDecisionGovernanceResult | null> {
  const repos = createRepositories()
  const opp = await repos.intelligence.getAutoOpportunity(opportunityId).catch(() => null)
  if (!opp) return null
  return evaluateAlertCandidate({ fixtureId: (opp as any).fixtureId, patternId: null, opportunityId, source: 'promoted_opportunity' })
}

export async function explainGovernanceDecision(resultId: string): Promise<string> {
  const r = await createRepositories().intelligence.getAlertDecisionGovernanceResult(resultId).catch(() => null)
  if (!r) return 'Decisão não encontrada.'
  return `[${r.mode}] ${r.action} (${r.severity}) — influência ${r.influenceBand}/${r.influenceScore}; readiness ${r.readinessStatus}; precheck ${r.precheckDecision}. wouldBlock=${r.wouldHaveBlocked} actuallyBlocked=${r.actuallyBlocked}.`
}
