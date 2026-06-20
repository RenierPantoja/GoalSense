/**
 * Alert Resolution Service — resolves pending alerts using post-trigger snapshots.
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase B8: Conservative, honest. Unknown ≠ failed. Shootout ≠ goal.
 * Phase E5: Repository-backed (Prisma or Firebase). No direct Prisma import.
 */
import { createRepositories } from '../../repositories/index.js'
import { recordAlertResolved } from '../intelligence/memory/intelligenceMemory.service.js'
import {
  isPromotedAlert, isPromotedAlertResolutionEnabled, readProvenance, recordPromotedAlertResolved,
} from '../intelligence/autoEngine/promotedAlertResolution.service.js'
import type { PromotedAlertResolutionResult } from '../intelligence/autoEngine/autoEngine.types.js'

const DEFAULT_USER = 'default'

/** Coerce a Date (Prisma) or ISO string (Firebase) to a Date. */
function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v)
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type ResolutionOutcome = 'confirmed' | 'confirmed_partial' | 'failed' | 'unknown' | 'expired'

export interface ResolutionResult {
  outcome: ResolutionOutcome
  resolutionType: string
  reason: string
  windowMinutes: number
  evidence: ResolutionEvidence
  // ── B34 (optional): exact outcome snapshot used for resolution ──
  outcomeSnapshotId?: string | null
  outcomeSnapshotCapturedAt?: string | null
  outcomeMinute?: number | null
}

export interface ResolutionEvidence {
  snapshotsAnalyzed: number
  scoreDelta: { home: number; away: number }
  goalsInWindow: number
  cornersInWindow: number
  cardsInWindow: number
  hasTimedEvents: boolean
  hasStats: boolean
  dataWarnings: string[]
}

export interface ResolutionWorkerResult {
  pendingChecked: number
  resolved: number
  confirmed: number
  partial: number
  failed: number
  unknown: number
  expired: number
  skipped: number
  errors: string[]
}

// ─── Resolution Type Inference ───────────────────────────────────────────────

const RESOLUTION_WINDOWS: Record<string, number> = {
  goal_pressure: 12,
  late_goal: 15,
  over_trend: 15,
  open_game: 15,
  dominance: 15,
  favorite_risk: 15,
  underdog_threat: 15,
  corner_pressure: 8,
  card_heat: 12,
  custom_unknown: 10,
}

const GOAL_TYPES = new Set(['goal_pressure', 'late_goal', 'over_trend', 'open_game', 'dominance', 'favorite_risk', 'underdog_threat'])
const CORNER_TYPES = new Set(['corner_pressure'])
const CARD_TYPES = new Set(['card_heat'])

function inferResolutionType(alert: { patternId: string; evidenceJson: string }): string {
  const evidence = safeParseJson(alert.evidenceJson, {})
  const patternName = (evidence.patternName || '').toLowerCase()

  // Infer from pattern name keywords
  if (patternName.includes('gol') || patternName.includes('goal') || patternName.includes('pressão')) return 'goal_pressure'
  if (patternName.includes('reta final') || patternName.includes('late')) return 'late_goal'
  if (patternName.includes('over') || patternName.includes('acima')) return 'over_trend'
  if (patternName.includes('escanteio') || patternName.includes('corner')) return 'corner_pressure'
  if (patternName.includes('cartão') || patternName.includes('card') || patternName.includes('falta')) return 'card_heat'
  if (patternName.includes('favorito') || patternName.includes('favorite')) return 'favorite_risk'
  if (patternName.includes('zebra') || patternName.includes('underdog')) return 'underdog_threat'
  if (patternName.includes('aberto') || patternName.includes('open')) return 'open_game'
  if (patternName.includes('domínio') || patternName.includes('dominance')) return 'dominance'

  return 'custom_unknown'
}

function getResolutionWindow(resolutionType: string): number {
  return RESOLUTION_WINDOWS[resolutionType] || 10
}

// ─── Snapshot Window Analysis ────────────────────────────────────────────────

interface WindowAnalysis {
  snapshotsCount: number
  scoreDelta: { home: number; away: number }
  goalsInWindow: number
  cornersInWindow: number
  cardsInWindow: number
  hasTimedEvents: boolean
  hasStats: boolean
  dataWarnings: string[]
  matchFinished: boolean
  inShootout: boolean
}

function analyzeSnapshotsInWindow(
  triggerMinute: number | null,
  triggerScoreHome: number,
  triggerScoreAway: number,
  snapshots: Array<{ minute: number | null; scoreHome: number; scoreAway: number; status: string; eventsJson: string | null; statsJson: string | null; dataQuality: string }>,
  windowMinutes: number,
): WindowAnalysis {
  const warnings: string[] = []

  if (snapshots.length === 0) {
    return { snapshotsCount: 0, scoreDelta: { home: 0, away: 0 }, goalsInWindow: 0, cornersInWindow: 0, cardsInWindow: 0, hasTimedEvents: false, hasStats: false, dataWarnings: ['No snapshots after alert'], matchFinished: false, inShootout: false }
  }

  const lastSnapshot = snapshots[snapshots.length - 1]
  const scoreDelta = {
    home: lastSnapshot.scoreHome - triggerScoreHome,
    away: lastSnapshot.scoreAway - triggerScoreAway,
  }

  const matchFinished = lastSnapshot.status === 'FT' || lastSnapshot.status === 'AET'
  const inShootout = lastSnapshot.status === 'P' || lastSnapshot.status === 'PEN'

  // Count events within window from all snapshots
  // IMPORTANT: Use only the LATEST snapshot's events to avoid double-counting
  // (each snapshot contains the full event list up to that point)
  let goalsInWindow = 0
  let cornersInWindow = 0
  let cardsInWindow = 0
  let hasTimedEvents = false
  let hasStats = false

  const windowEnd = triggerMinute != null ? triggerMinute + windowMinutes : null

  for (const snap of snapshots) {
    if (snap.statsJson) hasStats = true
  }

  // Use the last snapshot's events (most complete) to avoid double-counting
  const lastSnapshotWithEvents = [...snapshots].reverse().find(s => s.eventsJson)
  if (lastSnapshotWithEvents?.eventsJson) {
    const events = safeParseJson(lastSnapshotWithEvents.eventsJson, []) as Array<{ minute: number; type: string }>
    if (events.length > 0) {
      hasTimedEvents = true
      for (const evt of events) {
        // Only count events within the resolution window (after trigger, before window end)
        if (triggerMinute != null) {
          if (evt.minute < triggerMinute) continue
          if (windowEnd != null && evt.minute > windowEnd) continue
        }

        if (evt.type === 'goal' || evt.type === 'penalty_scored' || evt.type === 'own_goal') {
          goalsInWindow++
        } else if (evt.type === 'corner') {
          cornersInWindow++
        } else if (evt.type === 'yellow_card' || evt.type === 'red_card') {
          cardsInWindow++
        }
      }
    }
  }

  // If no timed events but score changed, infer goals from score delta
  if (!hasTimedEvents && (scoreDelta.home > 0 || scoreDelta.away > 0)) {
    goalsInWindow = scoreDelta.home + scoreDelta.away
    warnings.push('Goals inferred from score delta (no timed events)')
  }

  if (!hasTimedEvents && !hasStats) {
    warnings.push('No timed events and no stats available')
  }

  return {
    snapshotsCount: snapshots.length,
    scoreDelta,
    goalsInWindow,
    cornersInWindow,
    cardsInWindow,
    hasTimedEvents,
    hasStats,
    dataWarnings: warnings,
    matchFinished,
    inShootout,
  }
}

// ─── Resolution Logic ────────────────────────────────────────────────────────

function resolveGoalType(analysis: WindowAnalysis, windowMinutes: number): ResolutionResult {
  const evidence: ResolutionEvidence = {
    snapshotsAnalyzed: analysis.snapshotsCount,
    scoreDelta: analysis.scoreDelta,
    goalsInWindow: analysis.goalsInWindow,
    cornersInWindow: analysis.cornersInWindow,
    cardsInWindow: analysis.cardsInWindow,
    hasTimedEvents: analysis.hasTimedEvents,
    hasStats: analysis.hasStats,
    dataWarnings: analysis.dataWarnings,
  }

  // Shootout goals don't count
  if (analysis.inShootout) {
    return { outcome: 'unknown', resolutionType: 'goal_pressure', reason: 'Match entered shootout — cannot confirm goal pattern', windowMinutes, evidence }
  }

  if (analysis.snapshotsCount === 0) {
    return { outcome: 'unknown', resolutionType: 'goal_pressure', reason: 'No snapshots available after alert', windowMinutes, evidence }
  }

  if (analysis.goalsInWindow > 0 && analysis.hasTimedEvents) {
    return { outcome: 'confirmed', resolutionType: 'goal_pressure', reason: `${analysis.goalsInWindow} goal(s) confirmed by timed events within ${windowMinutes}min`, windowMinutes, evidence }
  }

  if (analysis.goalsInWindow > 0 && !analysis.hasTimedEvents) {
    return { outcome: 'confirmed_partial', resolutionType: 'goal_pressure', reason: `Score changed (+${analysis.scoreDelta.home + analysis.scoreDelta.away}) but no timed events to confirm`, windowMinutes, evidence }
  }

  // No goal — check if we have enough data to call it failed
  if (analysis.matchFinished || (analysis.hasTimedEvents && analysis.hasStats)) {
    return { outcome: 'failed', resolutionType: 'goal_pressure', reason: `No goal within ${windowMinutes}min window with sufficient data`, windowMinutes, evidence }
  }

  // Insufficient data
  return { outcome: 'unknown', resolutionType: 'goal_pressure', reason: 'Insufficient data to confirm or deny', windowMinutes, evidence }
}

function resolveCornerType(analysis: WindowAnalysis, windowMinutes: number): ResolutionResult {
  const evidence: ResolutionEvidence = {
    snapshotsAnalyzed: analysis.snapshotsCount, scoreDelta: analysis.scoreDelta,
    goalsInWindow: analysis.goalsInWindow, cornersInWindow: analysis.cornersInWindow,
    cardsInWindow: analysis.cardsInWindow, hasTimedEvents: analysis.hasTimedEvents,
    hasStats: analysis.hasStats, dataWarnings: analysis.dataWarnings,
  }

  if (analysis.snapshotsCount === 0) {
    return { outcome: 'unknown', resolutionType: 'corner_pressure', reason: 'No snapshots available', windowMinutes, evidence }
  }

  if (analysis.cornersInWindow > 0 && analysis.hasTimedEvents) {
    return { outcome: 'confirmed', resolutionType: 'corner_pressure', reason: `${analysis.cornersInWindow} corner(s) confirmed by events`, windowMinutes, evidence }
  }

  if (analysis.cornersInWindow > 0) {
    return { outcome: 'confirmed_partial', resolutionType: 'corner_pressure', reason: 'Corner count increased (stats delta)', windowMinutes, evidence }
  }

  if (!analysis.hasTimedEvents && !analysis.hasStats) {
    return { outcome: 'unknown', resolutionType: 'corner_pressure', reason: 'Provider did not deliver corner data', windowMinutes, evidence }
  }

  if (analysis.matchFinished || analysis.hasTimedEvents) {
    return { outcome: 'failed', resolutionType: 'corner_pressure', reason: `No corner within ${windowMinutes}min window`, windowMinutes, evidence }
  }

  return { outcome: 'unknown', resolutionType: 'corner_pressure', reason: 'Insufficient data', windowMinutes, evidence }
}

function resolveCardType(analysis: WindowAnalysis, windowMinutes: number): ResolutionResult {
  const evidence: ResolutionEvidence = {
    snapshotsAnalyzed: analysis.snapshotsCount, scoreDelta: analysis.scoreDelta,
    goalsInWindow: analysis.goalsInWindow, cornersInWindow: analysis.cornersInWindow,
    cardsInWindow: analysis.cardsInWindow, hasTimedEvents: analysis.hasTimedEvents,
    hasStats: analysis.hasStats, dataWarnings: analysis.dataWarnings,
  }

  if (analysis.snapshotsCount === 0) {
    return { outcome: 'unknown', resolutionType: 'card_heat', reason: 'No snapshots available', windowMinutes, evidence }
  }

  if (analysis.cardsInWindow > 0 && analysis.hasTimedEvents) {
    return { outcome: 'confirmed', resolutionType: 'card_heat', reason: `${analysis.cardsInWindow} card(s) confirmed by events`, windowMinutes, evidence }
  }

  if (analysis.cardsInWindow > 0) {
    return { outcome: 'confirmed_partial', resolutionType: 'card_heat', reason: 'Card count increased (stats delta)', windowMinutes, evidence }
  }

  if (!analysis.hasTimedEvents && !analysis.hasStats) {
    return { outcome: 'unknown', resolutionType: 'card_heat', reason: 'Provider did not deliver card data', windowMinutes, evidence }
  }

  if (analysis.matchFinished || analysis.hasTimedEvents) {
    return { outcome: 'failed', resolutionType: 'card_heat', reason: `No card within ${windowMinutes}min window`, windowMinutes, evidence }
  }

  return { outcome: 'unknown', resolutionType: 'card_heat', reason: 'Insufficient data', windowMinutes, evidence }
}

// ─── Main Resolution ─────────────────────────────────────────────────────────

async function resolveSingleAlert(alert: {
  id: string; patternId: string; fixtureId: string; triggerMinute: number | null;
  triggerScoreHome: number; triggerScoreAway: number; evidenceJson: string; createdAt: Date | string;
}): Promise<ResolutionResult | null> {
  const repos = createRepositories()
  const resolutionType = inferResolutionType(alert)
  const windowMinutes = getResolutionWindow(resolutionType)

  const createdAt = toDate(alert.createdAt)

  // Get snapshots after alert creation (never count snapshots before the trigger)
  const snapshots = await repos.liveSnapshots.findAfter(alert.fixtureId, createdAt, 50)

  // Check if enough time has passed for resolution
  const alertAge = Date.now() - createdAt.getTime()
  const windowMs = windowMinutes * 60 * 1000
  const maxWaitMs = windowMs * 3 // Wait up to 3x window before forcing resolution

  if (alertAge < windowMs && snapshots.length === 0) {
    // Too early and no data — skip for now
    return null
  }

  const analysis = analyzeSnapshotsInWindow(
    alert.triggerMinute, alert.triggerScoreHome, alert.triggerScoreAway,
    snapshots as any, windowMinutes,
  )

  // B34: the most recent snapshot within the window is the outcome evidence (exact).
  const outcomeSnap: any = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null
  const attach = (r: ResolutionResult | null): ResolutionResult | null => {
    if (!r) return r
    if (outcomeSnap?.id) {
      r.outcomeSnapshotId = String(outcomeSnap.id)
      r.outcomeSnapshotCapturedAt = outcomeSnap.capturedAt ? toDate(outcomeSnap.capturedAt).toISOString() : null
      r.outcomeMinute = typeof outcomeSnap.minute === 'number' ? outcomeSnap.minute : null
    }
    return r
  }

  // Route to type-specific resolver
  if (GOAL_TYPES.has(resolutionType)) {
    return attach(resolveGoalType(analysis, windowMinutes))
  }
  if (CORNER_TYPES.has(resolutionType)) {
    return attach(resolveCornerType(analysis, windowMinutes))
  }
  if (CARD_TYPES.has(resolutionType)) {
    return attach(resolveCardType(analysis, windowMinutes))
  }

  // Custom/unknown type — use goal-like resolution as fallback
  if (analysis.goalsInWindow > 0) {
    return attach({ outcome: 'confirmed_partial', resolutionType, reason: 'Goal occurred within window (custom pattern)', windowMinutes, evidence: { snapshotsAnalyzed: analysis.snapshotsCount, scoreDelta: analysis.scoreDelta, goalsInWindow: analysis.goalsInWindow, cornersInWindow: analysis.cornersInWindow, cardsInWindow: analysis.cardsInWindow, hasTimedEvents: analysis.hasTimedEvents, hasStats: analysis.hasStats, dataWarnings: analysis.dataWarnings } })
  }

  // Force resolution if alert is too old
  if (alertAge > maxWaitMs) {
    if (analysis.snapshotsCount === 0) {
      return attach({ outcome: 'expired', resolutionType, reason: 'Alert expired without snapshots', windowMinutes, evidence: { snapshotsAnalyzed: 0, scoreDelta: { home: 0, away: 0 }, goalsInWindow: 0, cornersInWindow: 0, cardsInWindow: 0, hasTimedEvents: false, hasStats: false, dataWarnings: ['No data available'] } })
    }
    if (!analysis.hasTimedEvents && !analysis.hasStats) {
      return attach({ outcome: 'unknown', resolutionType, reason: 'Expired without sufficient data', windowMinutes, evidence: { snapshotsAnalyzed: analysis.snapshotsCount, scoreDelta: analysis.scoreDelta, goalsInWindow: 0, cornersInWindow: 0, cardsInWindow: 0, hasTimedEvents: false, hasStats: false, dataWarnings: ['Insufficient data at expiry'] } })
    }
    return attach({ outcome: 'failed', resolutionType, reason: `No expected outcome within ${windowMinutes}min (expired)`, windowMinutes, evidence: { snapshotsAnalyzed: analysis.snapshotsCount, scoreDelta: analysis.scoreDelta, goalsInWindow: analysis.goalsInWindow, cornersInWindow: analysis.cornersInWindow, cardsInWindow: analysis.cardsInWindow, hasTimedEvents: analysis.hasTimedEvents, hasStats: analysis.hasStats, dataWarnings: analysis.dataWarnings } })
  }

  // Not enough time/data yet — skip
  return null
}

// ─── Batch Resolution ────────────────────────────────────────────────────────

export async function resolvePendingAlerts(maxAlerts: number): Promise<ResolutionWorkerResult> {
  const result: ResolutionWorkerResult = { pendingChecked: 0, resolved: 0, confirmed: 0, partial: 0, failed: 0, unknown: 0, expired: 0, skipped: 0, errors: [] }
  const repos = createRepositories()

  const pendingAlerts = await repos.alerts.listPending(DEFAULT_USER, maxAlerts)

  result.pendingChecked = pendingAlerts.length
  if (pendingAlerts.length === 0) return result

  for (const alert of pendingAlerts) {
    try {
      // Check if already resolved (race condition guard)
      const existing = await repos.alertResolutions.findByAlertId(alert.id)
      if (existing) { result.skipped++; continue }

      // ── B23: manually-promoted alerts are a separate, honest resolution class ──
      const promoted = isPromotedAlert(alert as any)
      if (promoted && !isPromotedAlertResolutionEnabled()) {
        // Governance flag off → leave pending (honest), never coerce to a result.
        result.skipped++; continue
      }

      const resolution = await resolveSingleAlert(alert as any)
      if (!resolution) { result.skipped++; continue }

      if (promoted) {
        const prov = readProvenance(alert as any)
        const ev = resolution.evidence
        const res = await recordPromotedAlertResolved({
          alertId: alert.id, fixtureId: (alert as any).fixtureId,
          opportunityId: prov.opportunityId, opportunityType: prov.opportunityType,
          createdAt: (alert as any).createdAt,
          goalsInWindow: ev.goalsInWindow, cornersInWindow: ev.cornersInWindow, cardsInWindow: ev.cardsInWindow,
          hasTimedEvents: ev.hasTimedEvents, hasStats: ev.hasStats, snapshotsAnalyzed: ev.snapshotsAnalyzed,
          scoreDelta: ev.scoreDelta, windowMinutes: resolution.windowMinutes,
        })
        if (res.resolved) {
          result.resolved++
          switch (res.result) {
            case 'confirmed': result.confirmed++; break
            case 'confirmed_partial': result.partial++; break
            case 'failed': result.failed++; break
            case 'unknown': case 'expired': result.unknown++; break
          }
        } else {
          result.skipped++
          if (res.reason) result.errors.push(`Promoted ${alert.id}: ${res.reason}`)
        }
        // NOTE: no performance counter, no Telegram for promoted alerts.
        continue
      }

      // Atomic: update alert.status + create resolution (Firestore batch / Prisma transaction).
      // 'unknown' stays 'unknown' — never coerced to 'failed'.
      await repos.alertResolutions.resolveAlert(alert.id, resolution.outcome, {
        resolutionStatus: resolution.outcome,
        resolutionType: resolution.resolutionType,
        windowMinutes: resolution.windowMinutes,
        evidenceJson: JSON.stringify(resolution.evidence),
      })

      // Incremental performance counter (derivative; idempotent; never block resolution).
      try {
        await repos.performance.applyResolutionToCounters({
          alertId: alert.id, patternId: (alert as any).patternId, userId: DEFAULT_USER,
          resolutionStatus: resolution.outcome, resolutionType: resolution.resolutionType,
        })
      } catch (e: any) {
        console.warn(`[ResolutionWorker] counter applyResolution failed for ${alert.id}: ${e?.message || e}`)
      }

      // Intelligence Memory (Phase B12): record the outcome + ledger transition +
      // (failed→) failure analysis + learning event. Non-blocking, never throws.
      try {
        const ev = resolution.evidence
        void recordAlertResolved({
          alertId: alert.id,
          fixtureId: (alert as any).fixtureId,
          patternId: (alert as any).patternId ?? null,
          createdAt: (alert as any).createdAt,
          result: resolution.outcome,
          resolutionType: resolution.resolutionType,
          windowMinutes: resolution.windowMinutes,
          outcomeReason: resolution.reason,
          snapshotsAnalyzed: ev.snapshotsAnalyzed,
          hasStats: ev.hasStats,
          hasTimedEvents: ev.hasTimedEvents,
          momentumSource: null,
          dataWarnings: ev.dataWarnings,
          outcomeSnapshotId: resolution.outcomeSnapshotId ?? null,
          outcomeSnapshotCapturedAt: resolution.outcomeSnapshotCapturedAt ?? null,
          outcomeMinute: resolution.outcomeMinute ?? null,
        })
      } catch (e: any) {
        console.warn(`[ResolutionWorker] intelligence outcome failed for ${alert.id}: ${e?.message || e}`)
      }

      result.resolved++
      switch (resolution.outcome) {
        case 'confirmed': result.confirmed++; break
        case 'confirmed_partial': result.partial++; break
        case 'failed': result.failed++; break
        case 'unknown': result.unknown++; break
        case 'expired': result.expired++; break
      }
    } catch (err: any) {
      result.errors.push(`Alert ${alert.id}: ${err?.message || 'unknown'}`)
    }
  }

  return result
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safeParseJson(str: string | null | undefined, fallback: any): any {
  if (!str) return fallback
  try { return JSON.parse(str) } catch { return fallback }
}

// ─── B23: on-demand resolution of a single promoted alert (env-gated route) ──

export async function resolveSinglePromotedAlertNow(alertId: string): Promise<{ ok: boolean; reason?: string; result?: PromotedAlertResolutionResult }> {
  const repos = createRepositories()
  const alert = await repos.alerts.findById(alertId, DEFAULT_USER)
  if (!alert) return { ok: false, reason: 'alert_not_found' }
  if (!isPromotedAlert(alert as any)) return { ok: false, reason: 'not_a_promoted_alert' }
  const existing = await repos.alertResolutions.findByAlertId(alertId)
  if (existing) return { ok: false, reason: 'already_resolved' }
  const resolution = await resolveSingleAlert(alert as any)
  if (!resolution) return { ok: false, reason: 'not_enough_data_yet' }
  const prov = readProvenance(alert as any)
  const ev = resolution.evidence
  const res = await recordPromotedAlertResolved({
    alertId, fixtureId: (alert as any).fixtureId,
    opportunityId: prov.opportunityId, opportunityType: prov.opportunityType,
    createdAt: (alert as any).createdAt,
    goalsInWindow: ev.goalsInWindow, cornersInWindow: ev.cornersInWindow, cardsInWindow: ev.cardsInWindow,
    hasTimedEvents: ev.hasTimedEvents, hasStats: ev.hasStats, snapshotsAnalyzed: ev.snapshotsAnalyzed,
    scoreDelta: ev.scoreDelta, windowMinutes: resolution.windowMinutes,
  })
  return { ok: res.resolved, reason: res.reason ?? undefined, result: res }
}
