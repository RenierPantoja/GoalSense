/**
 * Promoted Alert Resolution (Phase B23) — resolve manually-promoted alerts honestly.
 * ─────────────────────────────────────────────────────────────────────────────
 * A B22 promoted alert (sentinel patternId `auto_engine_manual`) is resolved as a
 * SEPARATE class: outcome is conservatively mapped by opportunity type, fed back to
 * the opportunity as a layer (never touching its score), written to the Signal
 * Ledger + a dedicated outcome link, and recorded as an observational learning
 * event. NEVER touches real pattern counters. No Telegram, no odds, no auto-alert.
 */
import { env } from '../../../env.js'
import { createRepositories } from '../../../repositories/index.js'
import { buildLedgerEntry } from '../memory/signalLedger.service.js'
import { createOpportunityAction } from './autoOpportunityActions.service.js'
import {
  mapPromotedOutcome, learningTypeForPromotedOutcome, buildOutcomeSummary, PROMOTED_RESULT_LABEL,
} from './utils/promotedAlertResolution.util.js'
import { OPP_TYPE_LABEL } from './utils/autoSignalLabels.util.js'
import { outcomeId, ledgerId } from '../utils/intelligenceId.util.js'
import type {
  OpportunityType, PromotedAlertOutcomeLink, PromotedAlertResolutionResult, AutoOpportunity,
} from './autoEngine.types.js'
import type { AlertResult, DataQuality, LearningEvent, SignalEvidenceSnapshot, DataAvailabilityMap } from '../contracts/intelligence.types.js'

const DEFAULT_USER = 'default'
const AUTO_ENGINE_PATTERN_ID = 'auto_engine_manual'

export function isPromotedAlertResolutionEnabled(): boolean {
  return String(env.ENABLE_PROMOTED_ALERT_RESOLUTION).toLowerCase() === 'true'
}
export function isPromotedAlertManualResolveEnabled(): boolean {
  return String(env.ENABLE_PROMOTED_ALERT_MANUAL_RESOLVE).toLowerCase() === 'true'
}

// ── B23 read helpers (honest empty defaults) ────────────────────────────────

export async function getOpportunityOutcomeSummary(opportunityId: string) {
  const repos = createRepositories()
  return repos.intelligence.getAutoOpportunityOutcomeSummary(opportunityId).catch(() => null)
}

export async function getPromotedAlertOutcomeLink(alertId: string) {
  const repos = createRepositories()
  return repos.intelligence.getPromotedAlertOutcomeLinkByAlertId(alertId).catch(() => null)
}

export interface PromotedAlertListItem {
  opportunityId: string
  alertId: string
  ledgerId: string | null
  opportunityType: OpportunityType
  originalScore: number
  promotedAt: string
  result: AlertResult
  outcomeReason: string | null
  resolvedAt: string | null
}

/** List promoted alerts joined with their outcome (pending until resolved). */
export async function listPromotedAlertsWithOutcome(limit = 100): Promise<PromotedAlertListItem[]> {
  const repos = createRepositories()
  const links = await repos.intelligence.listManualPromotedAlertLinks(limit).catch(() => [])
  const outcomes = await repos.intelligence.listAutoOpportunityOutcomeSummaries(500).catch(() => [])
  const byOpp = new Map(outcomes.map(o => [o.opportunityId, o]))
  return links.map(l => {
    const o = byOpp.get(l.opportunityId)
    return {
      opportunityId: l.opportunityId, alertId: l.alertId, ledgerId: l.ledgerId,
      opportunityType: l.opportunityType, originalScore: l.originalScore, promotedAt: l.promotedAt,
      result: (o?.result ?? 'pending') as AlertResult, outcomeReason: o?.outcomeReason ?? null,
      resolvedAt: o?.updatedAt ?? null,
    }
  })
}

function safeParse(s: any): any { if (!s) return {}; try { return typeof s === 'string' ? JSON.parse(s) : s } catch { return {} } }

/** Detect a manually-promoted alert (B22) by sentinel patternId or evidence source. */
export function isPromotedAlert(alert: { patternId?: string | null; evidenceJson?: string | null }): boolean {
  if (alert.patternId === AUTO_ENGINE_PATTERN_ID) return true
  const ev = safeParse(alert.evidenceJson)
  return ev?.source === 'auto_opportunity_manual' || ev?.provenance?.source === 'auto_opportunity_manual'
}

/** Read opportunity provenance from a promoted alert's evidenceJson. */
export function readProvenance(alert: { evidenceJson?: string | null }): { opportunityId: string | null; opportunityType: OpportunityType } {
  const ev = safeParse(alert.evidenceJson)
  const p = ev?.provenance || {}
  return {
    opportunityId: typeof p.opportunityId === 'string' ? p.opportunityId : null,
    opportunityType: (p.opportunityType as OpportunityType) || 'unknown',
  }
}

function qualityAtResolution(hasStats: boolean, hasTimedEvents: boolean, snapshots: number): DataQuality {
  if (snapshots === 0 || (!hasStats && !hasTimedEvents)) return 'unknown'
  if (hasStats && hasTimedEvents) return 'rich'
  return 'partial'
}

export interface RecordPromotedResolutionInput {
  alertId: string
  fixtureId: string
  opportunityId: string | null
  opportunityType: OpportunityType
  createdAt: string | Date | null
  goalsInWindow: number
  cornersInWindow: number
  cardsInWindow: number
  hasTimedEvents: boolean
  hasStats: boolean
  snapshotsAnalyzed: number
  scoreDelta: { home: number; away: number }
  windowMinutes: number
}

/**
 * Resolve a promoted alert end-to-end: persist alert status, outcome record, ledger
 * transition, outcome link, opportunity outcome summary, learning event, and an
 * auditable opportunity action. Never throws (best-effort, logged).
 */
export async function recordPromotedAlertResolved(input: RecordPromotedResolutionInput): Promise<PromotedAlertResolutionResult> {
  const repos = createRepositories()
  const resolvedAt = new Date().toISOString()
  const decision = mapPromotedOutcome({
    opportunityType: input.opportunityType,
    goalsInWindow: input.goalsInWindow, cornersInWindow: input.cornersInWindow, cardsInWindow: input.cardsInWindow,
    hasTimedEvents: input.hasTimedEvents, hasStats: input.hasStats, snapshotsAnalyzed: input.snapshotsAnalyzed,
  })
  const result = decision.result as AlertResult
  const dq = qualityAtResolution(input.hasStats, input.hasTimedEvents, input.snapshotsAnalyzed)
  const missingData: string[] = []
  if (!input.hasTimedEvents) missingData.push('eventos cronometrados')
  if (!input.hasStats) missingData.push('estatísticas ao vivo')

  const createdMs = input.createdAt ? new Date(input.createdAt instanceof Date ? input.createdAt.toISOString() : input.createdAt).getTime() : NaN
  const timeToResolutionMinutes = Number.isFinite(createdMs) ? Math.max(0, Math.round((Date.now() - createdMs) / 60000)) : null

  const out: PromotedAlertResolutionResult = {
    resolved: false, skipped: false, reason: null, alertId: input.alertId, opportunityId: input.opportunityId,
    result, resolutionType: decision.resolutionType, outcomeReason: decision.outcomeReason,
    ledgerUpdated: false, outcomeLinkId: null, learningEventId: null, resolvedAt,
  }

  // Fetch the opportunity once (labels + summary). Honest if absent.
  const opp: AutoOpportunity | null = input.opportunityId
    ? await repos.intelligence.getAutoOpportunity(input.opportunityId).catch(() => null)
    : null

  // 1) Persist alert status + resolution (status mirrors result; unknown stays unknown).
  try {
    await repos.alertResolutions.resolveAlert(input.alertId, result, {
      resolutionStatus: result,
      resolutionType: decision.resolutionType,
      windowMinutes: input.windowMinutes,
      evidenceJson: JSON.stringify({
        source: 'promoted_alert_resolution', goalsInWindow: input.goalsInWindow,
        cornersInWindow: input.cornersInWindow, cardsInWindow: input.cardsInWindow,
        hasTimedEvents: input.hasTimedEvents, hasStats: input.hasStats,
        snapshotsAnalyzed: input.snapshotsAnalyzed, scoreDelta: input.scoreDelta, limited: decision.limited,
      }),
    })
  } catch (e: any) {
    out.reason = `alert_resolve_failed:${e?.message || e}`
    return out
  }

  // 2) Alert outcome record (so Alertas 2.0 shows the result). patternId null — never a real pattern.
  try {
    await repos.intelligence.createAlertOutcome({
      id: outcomeId(input.alertId), alertId: input.alertId, fixtureId: input.fixtureId, patternId: null,
      result, resolutionType: decision.resolutionType, resolutionMinute: null, timeToResolutionMinutes,
      outcomeReason: decision.outcomeReason,
      whatConfirmed: result === 'confirmed' || result === 'confirmed_partial' ? [decision.outcomeReason] : [],
      whatFailed: result === 'failed' ? [decision.outcomeReason] : [],
      missingForConfirmation: result === 'unknown' ? missingData : [],
      dataQualityAtResolution: dq, resolvedAt, createdAt: resolvedAt, updatedAt: resolvedAt,
    })
  } catch (e: any) { console.warn(`[B23] outcome record failed for ${input.alertId} (non-blocking): ${e?.message || e}`) }

  // 3) Signal Ledger transition (+ B23 outcome fields). Reconstitute minimally if missing.
  const lid = ledgerId({ alertId: input.alertId, fixtureId: input.fixtureId })
  try {
    const patch = {
      signalStatus: 'resolved' as const, outcomeResult: result, outcomeReason: decision.outcomeReason,
      resolutionSource: 'promoted_alert_resolution' as const, resolvedAt,
      dataQualityAtResolution: dq, missingDataAtResolution: missingData,
    }
    const res = await repos.intelligence.updateSignalLedgerEntry(lid, patch)
    if (res.count > 0) out.ledgerUpdated = true
    else if (opp) {
      // Reconstitute a minimal ledger entry from the opportunity, then mark resolved.
      const typeLabel = OPP_TYPE_LABEL[input.opportunityType] || 'Oportunidade'
      const evidence: SignalEvidenceSnapshot = {
        evaluatedConditions: opp.evidence?.passedSignals ?? [], passedConditions: opp.evidence?.passedSignals ?? [],
        failedConditions: [], signalConditions: opp.evidence?.passedSignals ?? [], eligibilityConditions: [],
        blockers: opp.riskGate?.blockReasons ?? [], confidenceBreakdown: null,
        liveStatsUsed: opp.evidence?.liveStatsUsed ?? null, scoreState: opp.scoreState, minuteState: opp.minute,
        recentEvents: null, scopeReason: 'Reconstituído na resolução (ledger original ausente).',
        matchContextReason: null, providerQuality: (opp.evidence?.dataQuality ?? 'unknown') as DataQuality,
        missingData: opp.evidence?.missingData ?? [],
      }
      const availability: DataAvailabilityMap = {}
      const entry = buildLedgerEntry({
        alertId: input.alertId, patternId: null, userId: DEFAULT_USER, radarName: `Motor Automático — ${typeLabel}`,
        fixtureId: input.fixtureId, fixtureLabel: opp.fixtureLabel, leagueName: opp.leagueName,
        homeTeam: opp.homeTeam, awayTeam: opp.awayTeam, minute: opp.minute, score: opp.scoreState,
        signalStatus: 'resolved', signalType: input.opportunityType, confidence: null, severity: 'info',
        evidence, scopeReason: 'Reconstituído na resolução (ledger original ausente).', matchContext: null,
        dataAvailability: availability,
      })
      await repos.intelligence.createSignalLedgerEntry({ ...entry, ...patch })
      out.ledgerUpdated = true
    } else {
      // Cannot reconstitute — emit a limitation learning event (non-fatal).
      const ev: LearningEvent = {
        id: `lev_polledger_${input.alertId}`, type: 'auto_opportunity_promoted_alert_resolution_limited',
        fixtureId: input.fixtureId, alertId: input.alertId, patternId: null, contextKey: 'ledger_missing',
        message: 'Resolução de alerta promovido sem ledger original e sem oportunidade para reconstituir.',
        evidenceRef: input.opportunityId, confidence: 'low', source: 'promoted_alert_resolution', createdAt: resolvedAt,
      }
      try { await repos.intelligence.createLearningEvent(ev) } catch { /* */ }
    }
  } catch (e: any) { console.warn(`[B23] ledger update failed for ${input.alertId} (non-blocking): ${e?.message || e}`) }

  // 4) Promoted alert outcome link (reverse-lookup by alert or opportunity).
  const linkId = `pol_${input.alertId}`
  try {
    const link: PromotedAlertOutcomeLink = {
      id: linkId, opportunityId: input.opportunityId || '', promotedAlertId: input.alertId, ledgerId: lid,
      outcomeId: outcomeId(input.alertId), result, resolutionType: decision.resolutionType,
      outcomeReason: decision.outcomeReason, dataQualityAtResolution: dq, resolvedAt,
      source: 'promoted_alert_resolution',
    }
    await repos.intelligence.createPromotedAlertOutcomeLink(link)
    out.outcomeLinkId = linkId
  } catch (e: any) { console.warn(`[B23] outcome link failed for ${input.alertId} (non-blocking): ${e?.message || e}`) }

  // 5) Observational learning event (source=promoted_alert_resolution). NEVER auto-tunes.
  const evId = `lev_polres_${input.alertId}`
  try {
    const ev: LearningEvent = {
      id: evId, type: learningTypeForPromotedOutcome(result, decision.limited),
      fixtureId: input.fixtureId, alertId: input.alertId, patternId: null,
      contextKey: `promoted_result:${result}`,
      message: `Alerta promovido resolvido como ${PROMOTED_RESULT_LABEL[result]}: ${decision.outcomeReason}`,
      evidenceRef: input.opportunityId, confidence: result === 'unknown' ? 'low' : 'medium',
      source: 'promoted_alert_resolution', createdAt: resolvedAt,
    }
    await repos.intelligence.createLearningEvent(ev)
    out.learningEventId = evId
  } catch (e: any) { console.warn(`[B23] learning event failed for ${input.alertId} (non-blocking): ${e?.message || e}`) }

  // 6) Opportunity outcome summary + auditable action (updates user-state via reducer).
  if (input.opportunityId) {
    try {
      await repos.intelligence.upsertAutoOpportunityOutcomeSummary(buildOutcomeSummary({
        opportunityId: input.opportunityId, promotedAlertId: input.alertId, result,
        outcomeReason: decision.outcomeReason, limited: decision.limited,
        timeToResolutionMinutes, learningEventIds: out.learningEventId ? [out.learningEventId] : [], resolvedAt,
      }))
    } catch (e: any) { console.warn(`[B23] outcome summary failed for ${input.opportunityId} (non-blocking): ${e?.message || e}`) }
    try {
      await createOpportunityAction(input.opportunityId, {
        actionType: 'promoted_alert_resolved',
        metadata: { alertId: input.alertId, result, resolvedAt, resolutionType: decision.resolutionType },
      })
    } catch { /* never block */ }
  }

  out.resolved = true
  return out
}
