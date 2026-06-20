/**
 * Intelligence Memory orchestration (Phase B12).
 * ─────────────────────────────────────────────────────────────────────────────
 * Two non-blocking entry points wired into the existing alert lifecycle:
 *   - recordAlertCreated(): when the worker emits an alert.
 *   - recordAlertResolved(): when the resolution worker resolves an alert.
 *
 * GUARANTEES:
 *   - Never throws. Every write is wrapped; failures are logged and swallowed so
 *     they can never break alert creation or resolution.
 *   - Never invents data. Missing data is recorded as unavailable with a reason.
 *   - `unknown` is preserved as `unknown` (never counted as failure).
 */
import { createRepositories } from '../../../repositories/index.js'
import { env } from '../../../env.js'
import type { AlertResult, DataQuality, SignalLedgerEntry } from '../contracts/intelligence.types.js'
import { buildEvidenceSnapshot } from '../explainability/signalExplainability.service.js'
import { buildLedgerEntry } from './signalLedger.service.js'
import { buildFailureAnalysis, buildLearningEvent, learningTypeForResult } from '../learning/learningEvent.service.js'
import { outcomeId } from '../utils/intelligenceId.util.js'
import { buildLiveAvailabilityMap, collectMissingData, inferProviderQuality } from '../utils/dataAvailability.util.js'
import { linkTriggerSnapshot, linkOutcomeSnapshot } from '../evidence/evidenceLineage.service.js'
import { resolveSessionAttribution, recordAttributionEvent } from '../../validation/liveValidationAttribution.service.js'

export interface AlertCreatedContext {
  alertId: string
  userId: string
  pattern: { id: string; name: string; severity: string }
  fixture: { id: string; homeName: string; awayName: string; competition: string; canonicalKey: string }
  minute: number | null
  score: { home: number; away: number }
  confidence: number
  blockers: string[]
  conditionTypes: string[]
  passedConditionTypes: string[]
  failedConditionTypes: string[]
  signalType: string
  momentumSource: string | null
  liveStats: Record<string, number> | null
  recentEvents: Array<{ minute: number; type: string; side?: string }> | null
  provider: string
  dataQuality: string
  scopeReason: string | null
  matchContext: {
    competitionType: string; stage: string; isKnockout: boolean
    importance: number; importanceLabel: string; notes: string[]
  } | null
  // ── B34 (optional): exact trigger snapshot evidence ──
  triggerSnapshotId?: string | null
  triggerSnapshotCapturedAt?: string | null
}

export interface AlertResolvedContext {
  alertId: string
  fixtureId: string
  patternId: string | null
  createdAt: string | Date
  result: AlertResult
  resolutionType: string | null
  windowMinutes: number | null
  outcomeReason: string
  snapshotsAnalyzed: number
  hasStats: boolean
  hasTimedEvents: boolean
  momentumSource: string | null
  dataWarnings: string[]
  // ── B34 (optional): exact outcome snapshot evidence ──
  outcomeSnapshotId?: string | null
  outcomeSnapshotCapturedAt?: string | null
  outcomeMinute?: number | null
}

function toIso(v: string | Date): string {
  return v instanceof Date ? v.toISOString() : v
}

function qualityFromFlags(hasStats: boolean, hasTimedEvents: boolean): DataQuality {
  if (hasStats && hasTimedEvents) return 'rich'
  if (hasStats || hasTimedEvents) return 'partial'
  return 'poor'
}

/** Persist a ledger entry + evidence + learning event for a freshly-created alert. */
export async function recordAlertCreated(ctx: AlertCreatedContext): Promise<void> {
  try {
    const repos = createRepositories()
    const availability = buildLiveAvailabilityMap({
      provider: ctx.provider, dataQuality: ctx.dataQuality, stats: ctx.liveStats, events: ctx.recentEvents,
    })
    const missingData = collectMissingData(availability)
    const providerQuality = inferProviderQuality({ dataQuality: ctx.dataQuality, stats: ctx.liveStats, events: ctx.recentEvents })

    const evidence = buildEvidenceSnapshot({
      conditionTypes: ctx.conditionTypes,
      passedConditionTypes: ctx.passedConditionTypes,
      failedConditionTypes: ctx.failedConditionTypes,
      blockers: ctx.blockers,
      confidence: ctx.confidence,
      momentumSource: ctx.momentumSource,
      liveStats: ctx.liveStats,
      score: ctx.score,
      minute: ctx.minute,
      recentEvents: ctx.recentEvents,
      scopeReason: ctx.scopeReason,
      matchContextReason: ctx.matchContext ? ctx.matchContext.notes.join(' · ') || null : null,
      providerQuality,
      missingData,
    })

    const attribution = await resolveSessionAttribution(ctx.fixture.id)
    const entry = buildLedgerEntry({
      alertId: ctx.alertId,
      patternId: ctx.pattern.id,
      userId: ctx.userId,
      radarName: ctx.pattern.name,
      fixtureId: ctx.fixture.id,
      fixtureLabel: `${ctx.fixture.homeName} vs ${ctx.fixture.awayName}`,
      leagueName: ctx.fixture.competition,
      homeTeam: ctx.fixture.homeName,
      awayTeam: ctx.fixture.awayName,
      minute: ctx.minute,
      score: ctx.score,
      signalStatus: 'alerted',
      signalType: ctx.signalType,
      confidence: ctx.confidence,
      severity: ctx.pattern.severity,
      evidence,
      scopeReason: ctx.scopeReason,
      matchContext: ctx.matchContext
        ? { competitionType: ctx.matchContext.competitionType, stage: ctx.matchContext.stage, isKnockout: ctx.matchContext.isKnockout, importance: ctx.matchContext.importance, importanceLabel: ctx.matchContext.importanceLabel }
        : null,
      dataAvailability: availability,
    })

    await repos.intelligence.createSignalLedgerEntry({
      ...entry,
      triggerSnapshotId: ctx.triggerSnapshotId ?? null,
      triggerSnapshotCapturedAt: ctx.triggerSnapshotCapturedAt ?? null,
      triggerEvidenceStrength: ctx.triggerSnapshotId ? 'exact' : 'window_inferred',
      validationSessionId: attribution?.validationSessionId ?? null,
      sessionAttachedAt: attribution?.sessionAttachedAt ?? null,
    })

    // B33/B34: non-fatal evidence link — EXACT when the evaluated snapshotId is known.
    if (String(env.ENABLE_EVIDENCE_LINEAGE).toLowerCase() === 'true') {
      void linkTriggerSnapshot({
        fixtureId: ctx.fixture.id, alertId: ctx.alertId, patternId: ctx.pattern.id, minute: ctx.minute,
        snapshotId: ctx.triggerSnapshotId ?? null, capturedAt: ctx.triggerSnapshotCapturedAt ?? null, provider: ctx.provider,
        validationSessionId: attribution?.validationSessionId ?? null,
      })
    }
    // B38: session events (non-fatal).
    if (attribution) {
      void recordAttributionEvent({ sessionId: attribution.validationSessionId, type: 'signal_created', fixtureId: ctx.fixture.id, source: 'ledger', message: `Sinal/alerta em ${entry.fixtureLabel} (${ctx.signalType}).` })
      void recordAttributionEvent({ sessionId: attribution.validationSessionId, type: 'alert_created', fixtureId: ctx.fixture.id, source: 'ledger', message: `Alerta criado (conf ${ctx.confidence}).` })
    }

    await repos.intelligence.createLearningEvent(buildLearningEvent({
      type: 'alert_created',
      fixtureId: ctx.fixture.id,
      alertId: ctx.alertId,
      patternId: ctx.pattern.id,
      contextKey: `league:${ctx.fixture.competition}`,
      message: `Alerta emitido em ${entry.fixtureLabel} (${ctx.fixture.competition}) aos ${ctx.minute ?? '?'}' com confiança ${ctx.confidence}.`,
      evidenceRef: entry.id,
      confidence: 'medium',
    }))
  } catch (e: any) {
    console.warn(`[Intelligence] recordAlertCreated failed for ${ctx.alertId}: ${e?.message || e}`)
  }
}

/** Persist outcome + ledger transition + (failed→) failure analysis + learning event. */
export async function recordAlertResolved(ctx: AlertResolvedContext): Promise<void> {
  try {
    const repos = createRepositories()
    const now = new Date()
    const outcomeAttribution = await resolveSessionAttribution(ctx.fixtureId)
    const createdMs = new Date(toIso(ctx.createdAt)).getTime()
    const timeToResolutionMinutes = Number.isFinite(createdMs) ? Math.max(0, Math.round((now.getTime() - createdMs) / 60000)) : null
    const dataQualityAtResolution = qualityFromFlags(ctx.hasStats, ctx.hasTimedEvents)

    const whatConfirmed: string[] = []
    const whatFailed: string[] = []
    const missingForConfirmation: string[] = []
    if (ctx.result === 'confirmed' || ctx.result === 'confirmed_partial') {
      whatConfirmed.push(ctx.outcomeReason)
    } else if (ctx.result === 'failed') {
      whatFailed.push(ctx.outcomeReason)
    } else {
      // unknown / expired / pending — record what was missing, never as failure.
      missingForConfirmation.push(...(ctx.dataWarnings.length > 0 ? ctx.dataWarnings : [ctx.outcomeReason]))
    }

    await repos.intelligence.createAlertOutcome({
      id: outcomeId(ctx.alertId),
      alertId: ctx.alertId,
      fixtureId: ctx.fixtureId,
      patternId: ctx.patternId,
      result: ctx.result,
      resolutionType: ctx.resolutionType,
      resolutionMinute: null, // exact match-minute of resolution not tracked yet (honest null)
      timeToResolutionMinutes,
      outcomeReason: ctx.outcomeReason,
      whatConfirmed,
      whatFailed,
      missingForConfirmation,
      dataQualityAtResolution,
      resolvedAt: now.toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      outcomeSnapshotId: ctx.outcomeSnapshotId ?? null,
      outcomeSnapshotCapturedAt: ctx.outcomeSnapshotCapturedAt ?? null,
      validationSessionId: outcomeAttribution?.validationSessionId ?? null,
      sessionAttachedAt: outcomeAttribution?.sessionAttachedAt ?? null,
    })

    // Transition the ledger entry (if present) to resolved.
    const patch: Partial<SignalLedgerEntry> = { signalStatus: 'resolved' }
    await repos.intelligence.updateSignalLedgerEntry(`led_${ctx.alertId}`, patch)

    // B33/B34: non-fatal evidence link for the outcome — EXACT when a real snapshotId is known.
    if (String(env.ENABLE_EVIDENCE_LINEAGE).toLowerCase() === 'true') {
      void linkOutcomeSnapshot({
        fixtureId: ctx.fixtureId, alertId: ctx.alertId, patternId: ctx.patternId,
        outcomeId: outcomeId(ctx.alertId), minute: ctx.outcomeMinute ?? null,
        snapshotId: ctx.outcomeSnapshotId ?? null, capturedAt: ctx.outcomeSnapshotCapturedAt ?? null,
        validationSessionId: outcomeAttribution?.validationSessionId ?? null,
      })
    }
    // B38: outcome session event (non-fatal). unknown/not_evaluable are not failures.
    if (outcomeAttribution) {
      void recordAttributionEvent({
        sessionId: outcomeAttribution.validationSessionId, type: 'outcome_resolved', fixtureId: ctx.fixtureId, source: 'resolution',
        severity: ctx.result === 'failed' ? 'warning' : 'info',
        message: `Outcome ${ctx.result}: ${ctx.outcomeReason}`.slice(0, 200), metadata: { result: ctx.result },
      })
    }

    // Failure analysis only when genuinely failed (resolver already had data).
    if (ctx.result === 'failed') {
      await repos.intelligence.createFailureAnalysis(buildFailureAnalysis({
        alertId: ctx.alertId,
        fixtureId: ctx.fixtureId,
        patternId: ctx.patternId,
        hasStats: ctx.hasStats,
        hasTimedEvents: ctx.hasTimedEvents,
        snapshotsAnalyzed: ctx.snapshotsAnalyzed,
        dataQualityAtResolution,
        momentumSource: ctx.momentumSource,
        dataWarnings: ctx.dataWarnings,
      }))
    }

    await repos.intelligence.createLearningEvent(buildLearningEvent({
      type: learningTypeForResult(ctx.result),
      fixtureId: ctx.fixtureId,
      alertId: ctx.alertId,
      patternId: ctx.patternId,
      contextKey: `result:${ctx.result}`,
      message: `Resolução ${ctx.result}${ctx.resolutionType ? ` (${ctx.resolutionType})` : ''}: ${ctx.outcomeReason}`,
      evidenceRef: outcomeId(ctx.alertId),
      confidence: ctx.result === 'unknown' || ctx.result === 'expired' ? 'low' : 'medium',
    }))
  } catch (e: any) {
    console.warn(`[Intelligence] recordAlertResolved failed for ${ctx.alertId}: ${e?.message || e}`)
  }
}
