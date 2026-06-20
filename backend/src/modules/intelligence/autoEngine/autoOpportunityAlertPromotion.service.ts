/**
 * Manual Alert Promotion (Phase B22) — opportunity → monitored alert, human-only.
 * ─────────────────────────────────────────────────────────────────────────────
 * Creates a monitored alert ONLY by explicit human confirmation. Never automatic,
 * never Telegram, never odds, never bet. Uses a sentinel patternId so real patterns'
 * counters/profiles are untouched, and skips the performance counter entirely.
 * Provenance is mandatory; idempotent per opportunityId; ledger feeds Alertas 2.0.
 */
import { env } from '../../../env.js'
import { createRepositories } from '../../../repositories/index.js'
import { buildLedgerEntry } from '../memory/signalLedger.service.js'
import { createOpportunityAction } from './autoOpportunityActions.service.js'
import { buildPromotionPreview, evaluatePromotionGuard } from './utils/autoOpportunityAlertPromotion.util.js'
import { OPP_TYPE_LABEL } from './utils/autoSignalLabels.util.js'
import { linkPromotionSnapshot } from '../evidence/evidenceLineage.service.js'
import type {
  AutoOpportunity, ManualAlertPromotionPreview, ManualAlertPromotionRequest,
  ManualAlertPromotionResult, ManualPromotedAlertLink, PromotedAlertProvenance,
} from './autoEngine.types.js'
import type { SignalEvidenceSnapshot, DataAvailabilityMap, LearningEvent, DataQuality } from '../contracts/intelligence.types.js'

const DEFAULT_USER = 'default'
/** Sentinel — never a real user pattern (`pat_…`); keeps counters/profiles clean. */
const AUTO_ENGINE_PATTERN_ID = 'auto_engine_manual'

export function isManualPromotionEnabled(): boolean {
  return String(env.ENABLE_MANUAL_AUTO_OPPORTUNITY_PROMOTION).toLowerCase() === 'true'
}

export async function createManualAlertPromotionPreview(opportunityId: string): Promise<ManualAlertPromotionPreview | null> {
  const repos = createRepositories()
  const opp = await repos.intelligence.getAutoOpportunity(opportunityId)
  if (!opp) return null
  const link = await repos.intelligence.getManualPromotedAlertLink(opportunityId).catch(() => null)
  return buildPromotionPreview(opp, link)
}

export async function getPromotedAlertLink(opportunityId: string): Promise<ManualPromotedAlertLink | null> {
  const repos = createRepositories()
  return repos.intelligence.getManualPromotedAlertLink(opportunityId).catch(() => null)
}

function buildEvidenceSnapshot(opp: AutoOpportunity, scopeReason: string): SignalEvidenceSnapshot {
  return {
    evaluatedConditions: opp.evidence?.passedSignals ?? [],
    passedConditions: opp.evidence?.passedSignals ?? [],
    failedConditions: [],
    signalConditions: opp.evidence?.passedSignals ?? [],
    eligibilityConditions: [],
    blockers: opp.riskGate?.blockReasons ?? [],
    confidenceBreakdown: null,
    liveStatsUsed: opp.evidence?.liveStatsUsed ?? null,
    scoreState: opp.scoreState,
    minuteState: opp.minute,
    recentEvents: null,
    scopeReason,
    matchContextReason: (opp.contextFit?.notes ?? []).join(' · ') || null,
    providerQuality: (opp.evidence?.dataQuality ?? 'unknown') as DataQuality,
    missingData: opp.evidence?.missingData ?? [],
  }
}

function buildAvailabilityMap(opp: AutoOpportunity): DataAvailabilityMap {
  const quality = (opp.evidence?.dataQuality ?? 'unknown') as DataQuality
  const map: DataAvailabilityMap = {}
  for (const [k, available] of Object.entries(opp.dataAvailability || {})) {
    map[k] = { available, source: available ? 'auto_engine' : null, quality, unavailableReason: available ? undefined : 'not_collected_yet' }
  }
  return map
}

export async function promoteOpportunityToManualAlert(request: ManualAlertPromotionRequest): Promise<ManualAlertPromotionResult> {
  const opportunityId = request.opportunityId
  const fail = (reason: string): ManualAlertPromotionResult => ({ success: false, alertId: null, ledgerId: null, opportunityId, created: false, duplicate: false, reason, promotedAt: null })

  if (!isManualPromotionEnabled()) return fail('manual_promotion_disabled')

  const repos = createRepositories()
  const opp = await repos.intelligence.getAutoOpportunity(opportunityId)
  if (!opp) return fail('opportunity_not_found')

  // Idempotent: a second promotion returns the existing alert.
  const existing = await repos.intelligence.getManualPromotedAlertLink(opportunityId).catch(() => null)
  if (existing) {
    return { success: true, alertId: existing.alertId, ledgerId: existing.ledgerId, opportunityId, created: false, duplicate: true, reason: null, promotedAt: existing.promotedAt }
  }

  const guard = evaluatePromotionGuard(opp, false)
  if (!guard.canPromote) return fail(`not_promotable:${guard.blockedReasons.join(',')}`)

  // Explicit human confirmation is mandatory.
  if (request.userConfirmed !== true || !request.acknowledgeNoTelegram || !request.acknowledgeNoOdds || !request.acknowledgeNotGuaranteed) {
    return fail('confirmation_required')
  }

  const promotedAt = new Date().toISOString()
  const typeLabel = OPP_TYPE_LABEL[opp.opportunityType] || 'Oportunidade'
  const scopeReason = `Promovido manualmente do Motor Automático (oportunidade ${opp.id}; score ${opp.score}). Origem rastreável — não é alerta de radar configurado.`

  const provenance: PromotedAlertProvenance = {
    source: 'auto_opportunity_manual',
    opportunityId: opp.id,
    autoEngineRunId: opp.runId ?? null,
    opportunityType: opp.opportunityType,
    originalScore: opp.score,
    originalConfidenceBand: opp.confidenceBand,
    promotedByUserId: null,
    evidenceSnapshotRef: null,
    riskGateSnapshot: opp.riskGate,
    promotionNote: request.note ?? null,
    promotedAt,
  }

  const evidenceJson = JSON.stringify({
    source: 'auto_opportunity_manual',
    patternName: provenance ? `Motor Automático — ${typeLabel}` : typeLabel,
    homeTeam: opp.homeTeam, awayTeam: opp.awayTeam, competition: opp.leagueName,
    severity: guard.proposedSeverity,
    evidences: opp.evidence?.passedSignals ?? [],
    scope: { resolved: scopeReason },
    matchContext: opp.contextFit ? { competitionType: opp.contextFit.competitionType, importanceLabel: opp.contextFit.importanceLabel } : null,
    triggerSnapshot: { provider: opp.evidence?.provider, stats: opp.evidence?.liveStatsUsed, dataQuality: opp.evidence?.dataQuality },
    provenance,
    manualPromotion: true,
    telegramEligible: false,
    oddsEligible: false,
  })

  // 1) Create the monitored alert (sentinel patternId; NO performance counter).
  let createdAlert: any
  try {
    createdAlert = await repos.alerts.create({
      patternId: AUTO_ENGINE_PATTERN_ID,
      fixtureId: opp.fixtureId,
      status: 'pending',
      confidence: guard.proposedConfidence,
      signalState: 'ready_to_alert',
      triggerMinute: opp.minute,
      triggerScoreHome: opp.scoreState.home,
      triggerScoreAway: opp.scoreState.away,
      evidenceJson,
      temporalEvidenceJson: null,
      duplicateSignature: `auto_opportunity_${opp.id}`,
    }, DEFAULT_USER)
  } catch (e: any) {
    return fail(`alert_create_failed:${e?.message || e}`)
  }
  const alertId = createdAlert.id

  // 2) Signal Ledger entry (feeds Alertas 2.0). Non-blocking — alert still stands if this fails.
  let ledgerId: string | null = null
  try {
    const entry = buildLedgerEntry({
      alertId,
      patternId: null, // honest: not from a configured radar
      userId: DEFAULT_USER,
      radarName: `Motor Automático — ${typeLabel}`,
      fixtureId: opp.fixtureId,
      fixtureLabel: opp.fixtureLabel,
      leagueName: opp.leagueName,
      homeTeam: opp.homeTeam,
      awayTeam: opp.awayTeam,
      minute: opp.minute,
      score: opp.scoreState,
      signalStatus: 'alerted',
      signalType: opp.opportunityType,
      confidence: guard.proposedConfidence,
      severity: guard.proposedSeverity,
      evidence: buildEvidenceSnapshot(opp, scopeReason),
      scopeReason,
      matchContext: opp.contextFit
        ? { competitionType: opp.contextFit.competitionType || 'unknown', stage: 'unknown', isKnockout: false, importance: 0, importanceLabel: opp.contextFit.importanceLabel || 'média' }
        : null,
      dataAvailability: buildAvailabilityMap(opp),
    })
    await repos.intelligence.createSignalLedgerEntry(entry)
    ledgerId = entry.id
    // B33/B34: evidence link for the promoted alert — EXACT when the opportunity
    // carries a real evidenceSnapshotId, else inferred by fixture/window.
    if (String(env.ENABLE_EVIDENCE_LINEAGE).toLowerCase() === 'true') {
      void linkPromotionSnapshot({
        fixtureId: opp.fixtureId, alertId, opportunityId: opp.id, minute: opp.minute,
        snapshotId: (opp as any).evidenceSnapshotId ?? null, capturedAt: (opp as any).evidenceSnapshotCapturedAt ?? null,
      })
    }
  } catch (e: any) {
    console.warn(`[B22] ledger write failed for promoted alert ${alertId} (non-blocking): ${e?.message || e}`)
  }

  // 3) Persistent opportunity → alert link (idempotency + frontend badge).
  try {
    const link: ManualPromotedAlertLink = {
      id: `mpa_${opp.id}`, opportunityId: opp.id, fixtureId: opp.fixtureId, alertId, ledgerId,
      opportunityType: opp.opportunityType, originalScore: opp.score, originalConfidenceBand: opp.confidenceBand,
      provenance, promotedAt,
    }
    await repos.intelligence.createManualPromotedAlertLink(link)
  } catch (e: any) {
    console.warn(`[B22] promoted-link write failed for ${opp.id} (non-blocking): ${e?.message || e}`)
  }

  // 4) Auditable action (updates user-state with promotedAlertId via the reducer).
  try { await createOpportunityAction(opp.id, { actionType: 'manual_alert_promoted', metadata: { alertId, ledgerId }, note: request.note ?? null }) } catch { /* never block */ }

  // 5) Observational learning event (decision record — never statistical truth).
  try {
    const ev: LearningEvent = {
      id: `lev_promote_${alertId}`, type: 'auto_opportunity_promoted_to_alert',
      fixtureId: opp.fixtureId, alertId, patternId: null, contextKey: opp.leagueName || opp.opportunityType,
      message: 'O usuário promoveu manualmente uma oportunidade automática para alerta monitorado.',
      evidenceRef: opp.id, confidence: 'low', source: 'user_action', createdAt: promotedAt,
    }
    await repos.intelligence.createLearningEvent(ev)
  } catch { /* never block */ }

  return { success: true, alertId, ledgerId, opportunityId, created: true, duplicate: false, reason: null, promotedAt }
}

// ─── B25: auto-create from policy (gated; never human-confirmed) ─────────────

export function isAutoAlertCreateEnabled(): boolean {
  return String(env.ENABLE_AUTO_ALERT_CREATE).toLowerCase() === 'true'
    && String(env.ENABLE_AUTO_ALERT_POLICY).toLowerCase() === 'true'
    && String(env.ENABLE_AUTO_ENGINE_TO_ALERTS).toLowerCase() === 'true'
}

/**
 * Create a monitored alert from an APPROVED policy evaluation. Mirrors the manual
 * promotion machinery but provenance.source='auto_alert_policy'. Idempotent per
 * opportunity. NO Telegram, NO odds, NO performance counter (sentinel patternId).
 * The caller (policy evaluation service) is responsible for gate/flag checks; this
 * re-checks the create flags defensively.
 */
export async function createAutoAlertFromPolicy(input: {
  opp: AutoOpportunity; policyId: string; evaluationId: string; severity: 'critical' | 'attention' | 'info'; confidence: number
}): Promise<{ created: boolean; alertId: string | null; ledgerId: string | null; reason: string | null }> {
  const { opp } = input
  if (!isAutoAlertCreateEnabled()) return { created: false, alertId: null, ledgerId: null, reason: 'auto_create_flags_disabled' }

  const repos = createRepositories()
  const existing = await repos.intelligence.getManualPromotedAlertLink(opp.id).catch(() => null)
  if (existing) return { created: false, alertId: existing.alertId, ledgerId: existing.ledgerId, reason: 'duplicate' }

  const promotedAt = new Date().toISOString()
  const typeLabel = OPP_TYPE_LABEL[opp.opportunityType] || 'Oportunidade'
  const scopeReason = `Criado automaticamente por política (policy ${input.policyId}; evaluation ${input.evaluationId}; oportunidade ${opp.id}; score ${opp.score}). Origem rastreável — não é alerta de radar configurado.`

  const provenance: PromotedAlertProvenance = {
    source: 'auto_alert_policy', opportunityId: opp.id, autoEngineRunId: opp.runId ?? null,
    opportunityType: opp.opportunityType, originalScore: opp.score, originalConfidenceBand: opp.confidenceBand,
    promotedByUserId: null, evidenceSnapshotRef: null, riskGateSnapshot: opp.riskGate, promotionNote: null,
    promotedAt, policyId: input.policyId, evaluationId: input.evaluationId,
  }
  const evidenceJson = JSON.stringify({
    source: 'auto_alert_policy', patternName: `Motor Automático — Política`,
    homeTeam: opp.homeTeam, awayTeam: opp.awayTeam, competition: opp.leagueName,
    severity: input.severity, evidences: opp.evidence?.passedSignals ?? [],
    scope: { resolved: scopeReason }, provenance, autoAlertPolicy: true,
    telegramEligible: false, oddsEligible: false,
  })

  let createdAlert: any
  try {
    createdAlert = await repos.alerts.create({
      patternId: AUTO_ENGINE_PATTERN_ID, fixtureId: opp.fixtureId, status: 'pending',
      confidence: input.confidence, signalState: 'ready_to_alert', triggerMinute: opp.minute,
      triggerScoreHome: opp.scoreState.home, triggerScoreAway: opp.scoreState.away,
      evidenceJson, temporalEvidenceJson: null, duplicateSignature: `auto_opportunity_${opp.id}`,
    }, DEFAULT_USER)
  } catch (e: any) { return { created: false, alertId: null, ledgerId: null, reason: `alert_create_failed:${e?.message || e}` } }
  const alertId = createdAlert.id

  let ledgerId: string | null = null
  try {
    const entry = buildLedgerEntry({
      alertId, patternId: null, userId: DEFAULT_USER, radarName: 'Motor Automático — Política',
      fixtureId: opp.fixtureId, fixtureLabel: opp.fixtureLabel, leagueName: opp.leagueName,
      homeTeam: opp.homeTeam, awayTeam: opp.awayTeam, minute: opp.minute, score: opp.scoreState,
      signalStatus: 'alerted', signalType: opp.opportunityType, confidence: input.confidence, severity: input.severity,
      evidence: buildEvidenceSnapshot(opp, scopeReason), scopeReason,
      matchContext: opp.contextFit ? { competitionType: opp.contextFit.competitionType || 'unknown', stage: 'unknown', isKnockout: false, importance: 0, importanceLabel: opp.contextFit.importanceLabel || 'média' } : null,
      dataAvailability: buildAvailabilityMap(opp),
    })
    await repos.intelligence.createSignalLedgerEntry(entry)
    ledgerId = entry.id
  } catch (e: any) { console.warn(`[B25] ledger write failed for auto alert ${alertId} (non-blocking): ${e?.message || e}`) }

  try {
    const link: ManualPromotedAlertLink = {
      id: `mpa_${opp.id}`, opportunityId: opp.id, fixtureId: opp.fixtureId, alertId, ledgerId,
      opportunityType: opp.opportunityType, originalScore: opp.score, originalConfidenceBand: opp.confidenceBand,
      provenance, promotedAt,
    }
    await repos.intelligence.createManualPromotedAlertLink(link)
  } catch (e: any) { console.warn(`[B25] auto-alert link write failed for ${opp.id} (non-blocking): ${e?.message || e}`) }

  try { await createOpportunityAction(opp.id, { actionType: 'manual_alert_promoted', metadata: { alertId, ledgerId, autoAlertPolicy: true, policyId: input.policyId } }) } catch { /* never block */ }

  return { created: true, alertId, ledgerId, reason: null }
}
