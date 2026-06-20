/**
 * Auto Alert Policy evaluation (Phase B25) — load → guard → record → maybe create.
 * ─────────────────────────────────────────────────────────────────────────────
 * Evaluates an opportunity against each enabled policy and persists an explainable
 * evaluation + observational learning event. Creates a monitored alert ONLY when
 * the policy mode is auto_create_monitored AND every flag is on AND all critical
 * gates pass. Shadow-first by default. Never odds, never Telegram, never bet.
 */
import { createRepositories } from '../../../repositories/index.js'
import { env } from '../../../env.js'
import { evaluatePolicyGates } from './utils/autoAlertPolicyGuard.util.js'
import { getAutoOpportunityTypeProfile } from './autoEngineCalibration.service.js'
import { createAutoAlertFromPolicy, isAutoAlertCreateEnabled } from './autoOpportunityAlertPromotion.service.js'
import { linkPolicySnapshot } from '../evidence/evidenceLineage.service.js'
import { recordAttributionEvent } from '../../validation/liveValidationAttribution.service.js'
import { linkRecordToSession } from '../../validation/liveValidationRecordIndex.service.js'
import { incrementSessionMetric } from '../../validation/liveValidationSessionMetrics.service.js'
import {
  isAutoAlertPolicyEnabled, isAutoAlertCreateFlagEnabled, isAutoEngineToAlertsEnabled, getDefaultPolicyTemplate,
} from './autoAlertPolicyConfig.service.js'
import { minuteWindowOf } from '../learning/minuteWindow.util.js'
import type {
  AutoAlertPolicy, AutoAlertPolicyEvaluation, AutoAlertCalibrationSnapshot, AutoAlertPolicyDecision,
} from './autoAlertPolicy.types.js'
import type { AutoOpportunity } from './autoEngine.types.js'
import type { LearningEvent, LearningEventType } from '../contracts/intelligence.types.js'

const DECISION_EVENT: Record<AutoAlertPolicyDecision, LearningEventType> = {
  blocked: 'auto_alert_policy_blocked',
  shadow_would_create: 'auto_alert_policy_shadow_would_create',
  suggest_manual_review: 'auto_alert_policy_suggested_manual_review',
  auto_created: 'auto_alert_policy_auto_created',
  skipped_duplicate: 'auto_alert_policy_evaluated',
  skipped_policy_disabled: 'auto_alert_policy_evaluated',
  skipped_engine_disabled: 'auto_alert_policy_evaluated',
}

function severityFromScore(opp: AutoOpportunity): 'critical' | 'attention' | 'info' {
  return opp.status === 'strong' ? 'attention' : 'info'
}

async function buildCalibrationSnapshot(opportunityType: string, score: number): Promise<AutoAlertCalibrationSnapshot> {
  const profile = await getAutoOpportunityTypeProfile(opportunityType).catch(() => null)
  if (!profile) return { hasTypeProfile: false, sampleQuality: null, usefulRate: null, unknownRate: null, failedRate: null, scoreBucketInsufficient: false }
  return {
    hasTypeProfile: true, sampleQuality: profile.sampleQuality,
    usefulRate: profile.usefulRate, unknownRate: profile.unknownRate, failedRate: profile.failedRate,
    // We don't have the per-bucket profile here; treat insufficient overall sample as bucket-insufficient.
    scoreBucketInsufficient: profile.sampleQuality === 'insufficient',
  }
}

export interface EvaluateOpportunityResult {
  opportunityId: string
  evaluations: AutoAlertPolicyEvaluation[]
}

/** Evaluate one opportunity against all enabled policies. Per-run counts are tracked by the caller map. */
export async function evaluateOpportunityPolicies(
  opportunityId: string,
  opts: { runCounts?: Map<string, number>; policies?: AutoAlertPolicy[] } = {},
): Promise<EvaluateOpportunityResult> {
  const repos = createRepositories()
  const opp = await repos.intelligence.getAutoOpportunity(opportunityId).catch(() => null)
  if (!opp) return { opportunityId, evaluations: [] }

  const policies = (opts.policies ?? await repos.intelligence.listAutoAlertPolicies(200).catch(() => []))
    .filter(p => p.enabled && p.mode !== 'disabled')
  // If no persisted policies, fall back to the (disabled) default template so we still record a skip.
  const effective = policies.length > 0 ? policies : [getDefaultPolicyTemplate()]

  const [userState, dupLink, perFixtureEvals] = await Promise.all([
    repos.intelligence.getAutoOpportunityUserState(opportunityId).catch(() => null),
    repos.intelligence.getManualPromotedAlertLink(opportunityId).catch(() => null),
    repos.intelligence.listAutoAlertPolicyEvaluations(1000).catch(() => [] as AutoAlertPolicyEvaluation[]),
  ])
  const fixtureCreated = perFixtureEvals.filter((e: AutoAlertPolicyEvaluation) => e.fixtureId === opp.fixtureId && e.decision === 'auto_created').length
  const calibration = await buildCalibrationSnapshot(opp.opportunityType, opp.score)
  const minuteWindow = minuteWindowOf(opp.minute, null)

  const flags = { policyEnabled: isAutoAlertPolicyEnabled(), createEnabled: isAutoAlertCreateFlagEnabled(), toAlertsEnabled: isAutoEngineToAlertsEnabled() }
  const evaluations: AutoAlertPolicyEvaluation[] = []

  for (const policy of effective) {
    const perRunCount = opts.runCounts?.get(policy.id) ?? 0
    const guard = evaluatePolicyGates({
      policy,
      score: { score: opp.score, confidenceBand: opp.confidenceBand, status: opp.status, opportunityType: opp.opportunityType },
      league: opp.leagueName, homeTeam: opp.homeTeam, awayTeam: opp.awayTeam, minuteWindow,
      dataQuality: opp.evidence?.dataQuality ?? 'unknown',
      riskGate: { allowed: opp.riskGate?.allowed ?? false, blockReasons: opp.riskGate?.blockReasons ?? [], warnings: opp.riskGate?.warnings ?? [] },
      calibration,
      dismissed: !!userState?.dismissed,
      alreadyPromoted: !!dupLink || !!userState?.promotedAlertId,
      isDuplicate: !!dupLink,
      perFixtureCount: fixtureCreated,
      perRunCount,
      flags,
    })

    const evaluatedAt = new Date().toISOString()
    let decision = guard.decision
    let promotedAlertId: string | null = null
    const reasons = [...guard.reasons]

    // Execute auto-create only when the guard approved AND flags allow.
    if (decision === 'auto_created' && guard.canAutoCreate && isAutoAlertCreateEnabled()) {
      const evaluationId = `aape_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
      const created = await createAutoAlertFromPolicy({ opp, policyId: policy.id, evaluationId, severity: severityFromScore(opp), confidence: Math.max(1, Math.min(99, Math.round(opp.score))) })
      if (created.created && created.alertId) {
        promotedAlertId = created.alertId
        if (opts.runCounts) opts.runCounts.set(policy.id, perRunCount + 1)
      } else {
        decision = created.reason === 'duplicate' ? 'skipped_duplicate' : 'blocked'
        reasons.push(`Auto-create não concluído: ${created.reason}`)
      }
    } else if (decision === 'auto_created') {
      // Guard said auto but flags actually off → degrade to shadow honestly.
      decision = 'shadow_would_create'
      reasons.push('Flags de criação desligadas — registrado como shadow (nada criado).')
    }

    const evaluation: AutoAlertPolicyEvaluation = {
      id: `aape_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      policyId: policy.id, policyName: policy.name, opportunityId, runId: opp.runId ?? null, fixtureId: opp.fixtureId,
      evaluatedAt, mode: policy.mode, decision, gates: guard.gates,
      scoreSnapshot: { score: opp.score, confidenceBand: opp.confidenceBand, status: opp.status, opportunityType: opp.opportunityType },
      calibrationSnapshot: calibration,
      riskGateSnapshot: { allowed: opp.riskGate?.allowed ?? false, blockReasons: opp.riskGate?.blockReasons ?? [], warnings: opp.riskGate?.warnings ?? [] },
      reasons, limitations: guard.limitations, promotedAlertId, source: 'auto_alert_policy',
      policyEvidenceSnapshotId: (opp as any).evidenceSnapshotId ?? null,
      policyEvidenceCapturedAt: (opp as any).evidenceSnapshotCapturedAt ?? null,
      validationSessionId: (opp as any).validationSessionId ?? null,
      sessionAttachedAt: (opp as any).sessionAttachedAt ?? null,
    }

    try { await repos.intelligence.createAutoAlertPolicyEvaluation(evaluation) } catch { /* never block */ }
    // B38: policy session event (non-fatal).
    if ((opp as any).validationSessionId) {
      void recordAttributionEvent({ sessionId: (opp as any).validationSessionId, type: 'policy_evaluated', fixtureId: opp.fixtureId, source: 'policy', message: `Política "${policy.name}" → ${decision}`.slice(0, 200), metadata: { decision } })
      // B39: auxiliary session→record index link + scoped metric (non-fatal).
      void linkRecordToSession({ validationSessionId: (opp as any).validationSessionId, sessionName: null, recordType: 'policy_evaluation', recordId: evaluation.id, fixtureId: opp.fixtureId, policyEvaluationId: evaluation.id, opportunityId, source: 'policy', attributionStrength: 'exact_session_id', linkReason: 'policy evaluated during running session' })
      incrementSessionMetric((opp as any).validationSessionId, 'policyEvaluations')
    }
    // B34: non-fatal exact policy evidence link (inherits the opportunity snapshot).
    if (String(env.ENABLE_EVIDENCE_LINEAGE).toLowerCase() === 'true') {
      void linkPolicySnapshot({
        fixtureId: opp.fixtureId, opportunityId, policyEvaluationId: evaluation.id, minute: opp.minute ?? null,
        snapshotId: (opp as any).evidenceSnapshotId ?? null, capturedAt: (opp as any).evidenceSnapshotCapturedAt ?? null,
      })
    }
    try {
      const ev: LearningEvent = {
        id: `lev_aap_${evaluation.id}`, type: DECISION_EVENT[decision] || 'auto_alert_policy_evaluated',
        fixtureId: opp.fixtureId, alertId: promotedAlertId, patternId: null, contextKey: `policy:${policy.id}`,
        message: `Política "${policy.name}" → ${decision}${reasons[0] ? `: ${reasons[0]}` : ''}`,
        evidenceRef: evaluation.id, confidence: 'low', source: 'auto_alert_policy', createdAt: evaluatedAt,
      }
      await repos.intelligence.createLearningEvent(ev)
    } catch { /* never block */ }

    evaluations.push(evaluation)
  }

  return { opportunityId, evaluations }
}

/** Evaluate a batch of opportunities (used by the scanner hook). Never throws fatally. */
export async function evaluateOpportunitiesForRun(opportunityIds: string[]): Promise<{ evaluated: number; autoCreated: number; shadow: number; blocked: number }> {
  if (!isAutoAlertPolicyEnabled()) return { evaluated: 0, autoCreated: 0, shadow: 0, blocked: 0 }
  const repos = createRepositories()
  const policies = (await repos.intelligence.listAutoAlertPolicies(200).catch(() => [])).filter(p => p.enabled && p.mode !== 'disabled')
  if (policies.length === 0) return { evaluated: 0, autoCreated: 0, shadow: 0, blocked: 0 }

  const runCounts = new Map<string, number>()
  let evaluated = 0, autoCreated = 0, shadow = 0, blocked = 0
  for (const id of opportunityIds) {
    try {
      const res = await evaluateOpportunityPolicies(id, { runCounts, policies })
      for (const e of res.evaluations) {
        evaluated++
        if (e.decision === 'auto_created') autoCreated++
        else if (e.decision === 'shadow_would_create') shadow++
        else if (e.decision === 'blocked') blocked++
      }
    } catch (e: any) { console.warn(`[B25] policy eval failed for ${id} (non-blocking): ${e?.message || e}`) }
  }
  return { evaluated, autoCreated, shadow, blocked }
}

export async function listOpportunityPolicyEvaluations(opportunityId: string, limit = 50): Promise<AutoAlertPolicyEvaluation[]> {
  return createRepositories().intelligence.listAutoAlertPolicyEvaluationsByOpportunity(opportunityId, limit).catch(() => [])
}

export async function listPolicyEvaluations(limit = 100): Promise<AutoAlertPolicyEvaluation[]> {
  return createRepositories().intelligence.listAutoAlertPolicyEvaluations(limit).catch(() => [])
}
